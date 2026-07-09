import crypto from "crypto";
import mongoose from "mongoose";
import { setTimeout as sleep } from "node:timers/promises";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

import contentPipelineRouter from "../../../queues/contentPipelineRouter.queue.js";

import { resolveQuestionVersionSeedState } from "../questionVersioning.shared.js";

const QUESTION_VERSION_LOCK_TTL_MS = 30000;
const QUESTION_VERSION_LOCK_WAIT_MS = 10000;
const QUESTION_VERSION_LOCK_RETRY_DELAY_MS = 100;
const QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS = 10000;

const QUESTION_VERSION_MAX_RETRIES = 3;
const QUESTION_VERSION_RETRY_BACKOFF_MS = [100, 300, 700];

type QuestionVersionSeed = {
  currentVersion: number;
  moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
  moderationUpdatedAt: Date | null;
  moderationSourceVersion: number | null;
  topicStatus: "PENDING" | "PROCESSING" | "VALID" | "OFF_TOPIC";
  embeddingStatus: "NONE" | "PENDING" | "PROCESSING" | "READY";
};

const acquireQuestionVersionLock = async (questionId: string) => {
  const redis = getRedisCacheClient();
  const lockKey = `lock:questionVersioning:${questionId}`;
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + QUESTION_VERSION_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redis.set(
      lockKey,
      lockToken,
      "PX",
      QUESTION_VERSION_LOCK_TTL_MS,
      "NX",
    );

    if (acquired === "OK") return { lockKey, lockToken };

    await sleep(QUESTION_VERSION_LOCK_RETRY_DELAY_MS);
  }

  throw new Error(
    `Could not acquire question version lock for question ${questionId}`,
  );
};

const releaseQuestionVersionLock = async (
  lockKey: string,
  lockToken: string,
) => {
  const redis = getRedisCacheClient();

  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
  );
};

const renewQuestionVersionLock = async (lockKey: string, lockToken: string) => {
  const redis = getRedisCacheClient();

  const renewed = await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
    String(QUESTION_VERSION_LOCK_TTL_MS),
  );

  return Number(renewed) === 1;
};

const isRetryableQuestionVersioningError = (error: unknown) => {
  const code = (error as { code?: number })?.code;
  if (code === 11000) return true;

  const hasErrorLabel = (
    error as { hasErrorLabel?: (label: string) => boolean }
  )?.hasErrorLabel;

  if (typeof hasErrorLabel === "function") {
    if (hasErrorLabel("TransientTransactionError")) return true;
    if (hasErrorLabel("UnknownTransactionCommitResult")) return true;
  }

  return false;
};

type ProcessQuestionVersioningJobData = {
  questionId: string;
  intendedVersion: number;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
  moderationUpdatedAt: Date | null;
  topicStatus: "PENDING" | "PROCESSING" | "VALID" | "OFF_TOPIC";
  embeddingStatus: "NONE" | "PENDING" | "PROCESSING" | "READY";
  basedOnVersion?: number;
};

const processQuestionVersioningJob = async (
  data: ProcessQuestionVersioningJobData,
) => {
  const {
    questionId,
    intendedVersion,
    userId,
    title,
    body,
    tags,
    moderationStatus,
    moderationUpdatedAt,
    topicStatus,
    embeddingStatus,
  } = data;
  let { basedOnVersion } = data;

  const { lockKey, lockToken } = await acquireQuestionVersionLock(questionId);
  const lockRenewer = setInterval(() => {
    void renewQuestionVersionLock(lockKey, lockToken)
      .then((renewed) => {
        if (!renewed) {
          console.error(
            `Question version lock lost before renewal for question ${questionId}`,
          );
        }
      })
      .catch((error) => {
        console.error(
          `Failed to renew question version lock for question ${questionId}:`,
          error,
        );
      });
  }, QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS);

  try {
    let nextVersion = Number(intendedVersion ?? 1);
    let activeVersionNumber: number | null = null;
    let resolvedBasedOnVersion = basedOnVersion;

    for (let attempt = 0; attempt <= QUESTION_VERSION_MAX_RETRIES; attempt++) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const currentQuestion = await Question.findById(questionId)
            .select(
              "currentVersion moderationStatus moderationUpdatedAt moderationSourceVersion topicStatus embeddingStatus",
            )
            .session(session)
            .lean<QuestionVersionSeed>();

          if (!currentQuestion) {
            throw new Error(`Question not found: ${questionId}`);
          }

          if (Number(currentQuestion.currentVersion) < nextVersion) {
            throw new Error(
              `Question version ${nextVersion} does not exist on parent question ${questionId}`,
            );
          }

          const existingTargetVersion = await QuestionVersion.findOne({
            questionId,
            version: nextVersion,
          })
            .select("_id")
            .session(session)
            .lean();

          if (existingTargetVersion) return;

          if (!resolvedBasedOnVersion)
            resolvedBasedOnVersion = nextVersion > 1 ? nextVersion - 1 : 1;

          const {
            isCurrentLiveVersion,
            moderationStatus: resolvedModerationStatus,
            moderationUpdatedAt: resolvedModerationUpdatedAt,
            topicStatus: resolvedTopicStatus,
            embeddingStatus: resolvedEmbeddingStatus,
          } = resolveQuestionVersionSeedState({
            currentQuestion,
            nextVersion,
            queuedSnapshot: {
              moderationStatus,
              moderationUpdatedAt,
              topicStatus,
              embeddingStatus,
            },
          });

          if (isCurrentLiveVersion) {
            const activeVersion = await QuestionVersion.findOne(
              { questionId, isActive: true },
              { version: 1 },
            )
              .session(session)
              .lean();

            activeVersionNumber = activeVersion
              ? Number(activeVersion.version)
              : null;

            await QuestionVersion.updateMany(
              { questionId, isActive: true },
              { $set: { isActive: false } },
              { session },
            );
          }

          await QuestionVersion.create(
            [
              {
                questionId,
                userId,
                title,
                body,
                tags,
                version: nextVersion,
                basedOnVersion: resolvedBasedOnVersion,
                isActive: isCurrentLiveVersion,
                moderationStatus: resolvedModerationStatus,
                moderationUpdatedAt: resolvedModerationUpdatedAt,
                topicStatus: resolvedTopicStatus,
                embeddingStatus: resolvedEmbeddingStatus,
                embedding: [],
                similarQuestionIds: [],
              },
            ],
            { session },
          );
        });
        break;
      } catch (error) {
        const canRetry =
          attempt < QUESTION_VERSION_MAX_RETRIES &&
          isRetryableQuestionVersioningError(error);
        if (!canRetry) throw error;

        await sleep(QUESTION_VERSION_RETRY_BACKOFF_MS[attempt] ?? 1000);
      } finally {
        await session.endSession();
      }
    }

    basedOnVersion = resolvedBasedOnVersion;

    const targetVersionExists = await QuestionVersion.findOne({
      questionId,
      version: nextVersion,
    })
      .select("_id")
      .lean();

    if (!targetVersionExists) return;

    await contentPipelineRouter.add(
      "QUESTION",
      {
        contentId: questionId,
        version: nextVersion,
      },
      {
        jobId: makeJobId("contentPipelineRoute", questionId, nextVersion),
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    if (activeVersionNumber) {
      await getRedisCacheClient().del(
        `question:${questionId}`,
        `v:${activeVersionNumber}:question:${questionId}`,
      );
    }
  } finally {
    clearInterval(lockRenewer);
    await releaseQuestionVersionLock(lockKey, lockToken);
  }
};

export default processQuestionVersioningJob;
