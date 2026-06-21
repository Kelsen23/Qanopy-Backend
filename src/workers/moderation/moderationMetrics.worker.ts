import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import { redisMessagingClientConnection } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import {
  assertModerationActionJobName,
  assertModerationReviewer,
  createWorkerEventHandlers,
  type ModerationActionJobName,
  type ModerationReviewer,
} from "./shared.js";

const workerFilePath = fileURLToPath(import.meta.url);

const getTrustScoreDelta = (jobName: ModerationActionJobName) => {
  switch (jobName) {
    case "BAN_PERM":
      return -0.25;
    case "BAN_TEMP":
      return -0.1;
    case "WARN":
      return -0.03;
    case "IGNORE":
      return 0.01;
  }
};

const updateModerationStats = async (
  userId: string,
  jobName: ModerationActionJobName,
  reviewedBy: ModerationReviewer,
) => {
  const stats = await prisma.moderationStats.findUnique({
    where: { userId },
  });

  if (!stats) {
    throw new Error("Moderation stats not found");
  }

  const trustScore = Math.max(
    0,
    Math.min(1, stats.trustScore + getTrustScoreDelta(jobName)),
  );

  if (jobName === "IGNORE") {
    await prisma.moderationStats.update({
      where: { userId },
      data: { trustScore },
    });

    return;
  }

  if (jobName === "BAN_PERM") {
    await prisma.moderationStats.update({
      where: { userId },
      data:
        reviewedBy === "AI_MODERATION"
          ? {
              lastStrikeAt: new Date(),
              trustScore,
              totalStrikes: { increment: 1 },
            }
          : {
              trustScore,
              rejectedCount: { increment: 1 },
            },
    });

    return;
  }

  if (jobName === "BAN_TEMP") {
    await prisma.moderationStats.update({
      where: { userId },
      data: {
        trustScore,
        rejectedCount: { increment: 1 },
      },
    });

    return;
  }

  await prisma.moderationStats.update({
    where: { userId },
    data: {
      trustScore,
      flaggedCount: { increment: 1 },
    },
  });
};

const handlers = createWorkerEventHandlers("moderationMetrics");
const startWorker = () => {
  const worker = new Worker(
    "moderationMetricsQueue",
    async (job) => {
      const userId = job.data.userId as string;
      const jobName = assertModerationActionJobName(job.name);
      const reviewedBy = assertModerationReviewer(job.data.reviewedBy);

      await updateModerationStats(userId, jobName, reviewedBy);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 10,
      limiter: {
        max: 15,
        duration: 1000,
      },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
};

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startWorker();
}

export { startWorker };
