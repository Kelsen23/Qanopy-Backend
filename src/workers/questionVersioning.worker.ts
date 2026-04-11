import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";
import mongoose from "mongoose";

import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import crypto from "crypto";

import { setTimeout as sleep } from "node:timers/promises";

const QUESTION_VERSION_LOCK_TTL_MS = 30000;
const QUESTION_VERSION_LOCK_WAIT_MS = 10000;
const QUESTION_VERSION_LOCK_RETRY_DELAY_MS = 100;
const QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS = 10000;

const QUESTION_VERSION_MAX_RETRIES = 3;
const QUESTION_VERSION_RETRY_BACKOFF_MS = [100, 300, 700];

async function acquireQuestionVersionLock(questionId: string) {
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
}

async function releaseQuestionVersionLock(lockKey: string, lockToken: string) {
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
}

async function renewQuestionVersionLock(lockKey: string, lockToken: string) {
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
}

function isRetryableQuestionVersioningError(error: unknown) {
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
}

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question versioning worker...");

  const worker = new Worker(
    "questionVersioningQueue",
    async (job) => {
      const { questionId, userId, title, body, tags } = job.data;
      const {
        moderationStatus = "PENDING",
        moderationUpdatedAt = null,
        topicStatus = "PENDING",
        embeddingStatus = "NONE",
      } = job.data;
      let { basedOnVersion } = job.data;

      const { lockKey, lockToken } = await acquireQuestionVersionLock(
        String(questionId),
      );
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
        let nextVersion = 1;
        let activeVersionNumber: number | null = null;
        let resolvedBasedOnVersion = basedOnVersion;

        for (let attempt = 0; attempt <= QUESTION_VERSION_MAX_RETRIES; attempt++) {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              const latestVersion = await QuestionVersion.findOne({ questionId })
                .sort({
                  version: -1,
                })
                .session(session)
                .lean();

              nextVersion = latestVersion ? Number(latestVersion.version) + 1 : 1;

              if (!resolvedBasedOnVersion)
                resolvedBasedOnVersion = latestVersion
                  ? Number(latestVersion.version)
                  : 1;

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
                    isActive: true,
                    moderationStatus,
                    moderationUpdatedAt,
                    topicStatus,
                    embeddingStatus,
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

        await contentPipelineRouter.add(
          "CONTENT_PIPELINE_ROUTE",
          {
            questionId,
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
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Worker crashed:", err);
  });
}

startWorker().catch((error) => {
  console.error("Failed to start question versioning worker:", error);
  process.exit(1);
});
