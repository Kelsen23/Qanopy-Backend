import mongoose from "mongoose";
import { setTimeout as sleep } from "node:timers/promises";

import {
  assertProcessQuestionVersioningJobData,
  isRetryableQuestionVersioningError,
  resolveQuestionVersionSeedState,
  type ProcessQuestionVersioningJobData,
} from "../versioning/questionVersioning.shared.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";
import { withQuestionVersionLock } from "../versioning/questionVersioning.lock.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import QuestionVersion from "../../../models/questionVersion.model.js";
import Question from "../../../models/question.model.js";

const QUESTION_VERSION_MAX_RETRIES = 3;
const QUESTION_VERSION_RETRY_BACKOFF_MS = [100, 300, 700];

const QUESTION_VERSION_PARENT_SELECT =
  "currentVersion moderationStatus moderationUpdatedAt moderationSourceVersion";

type QuestionVersionSeed = {
  currentVersion: number;
  moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
  moderationUpdatedAt: Date | null;
  moderationSourceVersion: number | null;
};

type EnsureQuestionVersionExistsResult = {
  nextVersion: number;
  targetVersionExists: boolean;
};

type QuestionVersionSnapshot = {
  version: number;
  basedOnVersion: number;
  isActive: boolean;
};

const loadQuestionVersionSeed = async (
  questionId: string,
  session: mongoose.ClientSession,
) =>
  Question.findById(questionId)
    .select(QUESTION_VERSION_PARENT_SELECT)
    .session(session)
    .lean<QuestionVersionSeed>();

const createQuestionVersionRecord = async ({
  data,
  nextVersion,
  resolvedBasedOnVersion,
  session,
}: {
  data: ProcessQuestionVersioningJobData;
  nextVersion: number;
  resolvedBasedOnVersion: number;
  session: mongoose.ClientSession;
}) => {
  const currentQuestion = await loadQuestionVersionSeed(
    data.questionId,
    session,
  );

  if (!currentQuestion) {
    throw new Error(`Question not found: ${data.questionId}`);
  }

  if (Number(currentQuestion.currentVersion) < nextVersion) {
    throw new Error(
      `Question version ${nextVersion} does not exist on parent question ${data.questionId}`,
    );
  }

  const existingTargetVersion = await QuestionVersion.findOne({
    questionId: data.questionId,
    version: nextVersion,
  })
    .select("_id")
    .session(session)
    .lean();

  if (existingTargetVersion) return;

  const {
    isCurrentLiveVersion,
    moderationStatus: resolvedModerationStatus,
    moderationUpdatedAt: resolvedModerationUpdatedAt,
  } = resolveQuestionVersionSeedState({
    currentQuestion,
    nextVersion,
    queuedSnapshot: {
      moderationStatus: data.moderationStatus,
      moderationUpdatedAt: data.moderationUpdatedAt,
    },
  });

  if (isCurrentLiveVersion) {
    await QuestionVersion.updateMany(
      { questionId: data.questionId, isActive: true },
      { $set: { isActive: false } },
      { session },
    );
  }

  await QuestionVersion.create(
    [
      {
        questionId: data.questionId,
        userId: data.userId,
        title: data.title,
        body: data.body,
        tags: data.tags,
        version: nextVersion,
        basedOnVersion: resolvedBasedOnVersion,
        isActive: isCurrentLiveVersion,
        moderationStatus: resolvedModerationStatus,
        moderationUpdatedAt: resolvedModerationUpdatedAt,
      },
    ],
    { session },
  );
};

const ensureQuestionVersionExistsWithRetry = async (
  data: ProcessQuestionVersioningJobData,
): Promise<EnsureQuestionVersionExistsResult> => {
  const nextVersion = Number(data.intendedVersion);
  const resolvedBasedOnVersion =
    data.basedOnVersion ?? (nextVersion > 1 ? nextVersion - 1 : 1);

  for (let attempt = 0; attempt <= QUESTION_VERSION_MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        await createQuestionVersionRecord({
          data,
          nextVersion,
          resolvedBasedOnVersion,
          session,
        });
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

  const targetVersion = await QuestionVersion.findOne({
    questionId: data.questionId,
    version: nextVersion,
  })
    .select("_id")
    .lean();

  return {
    nextVersion,
    targetVersionExists: Boolean(targetVersion),
  };
};

const loadTargetQuestionVersion = async (questionId: string, version: number) =>
  QuestionVersion.findOne({ questionId, version })
    .select("version basedOnVersion isActive")
    .lean<QuestionVersionSnapshot>();

const queueQuestionContentPipeline = async (
  questionId: string,
  version: number,
) =>
  queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version,
  });

const clearQuestionVersionCaches = async ({
  questionId,
  targetVersion,
}: {
  questionId: string;
  targetVersion: QuestionVersionSnapshot;
}) => {
  const cacheKeys = new Set<string>([`question:${questionId}`]);

  if (
    targetVersion.isActive &&
    Number(targetVersion.basedOnVersion) !== Number(targetVersion.version)
  ) {
    cacheKeys.add(`v:${targetVersion.basedOnVersion}:question:${questionId}`);
  }

  await getRedisCacheClient().del(...cacheKeys);
};

const processQuestionVersioningJob = async (
  data: ProcessQuestionVersioningJobData,
) => {
  assertProcessQuestionVersioningJobData(data);

  await withQuestionVersionLock(data.questionId, async ({ assertLockHeld }) => {
    const { nextVersion, targetVersionExists } =
      await ensureQuestionVersionExistsWithRetry(data);

    if (!targetVersionExists) return;

    const targetVersion = await loadTargetQuestionVersion(
      data.questionId,
      nextVersion,
    );

    if (!targetVersion) return;

    await assertLockHeld();
    await queueQuestionContentPipeline(data.questionId, nextVersion);
    await clearQuestionVersionCaches({
      questionId: data.questionId,
      targetVersion,
    });
  });
};

export default processQuestionVersioningJob;
