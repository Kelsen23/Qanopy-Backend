import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import awardBadge from "../services/user/badge/awardBadge.service.js";
import {
  badgeTriggers,
  type BadgeTrigger,
} from "../services/user/badge/badge.shared.js";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const workerFilePath = fileURLToPath(import.meta.url);

const isBadgeTrigger = (value: string): value is BadgeTrigger =>
  Object.values(badgeTriggers).includes(value as BadgeTrigger);

async function startBadgeWorker() {
  console.log("Starting badge worker...");

  const worker = new Worker(
    "badgeQueue",
    async (job) => {
      if (!isBadgeTrigger(job.name)) {
        throw new Error(`Unsupported badge trigger: ${job.name}`);
      }

      const { userId } = job.data as {
        userId: string;
      };

      return awardBadge({
        userId,
        trigger: job.name,
      });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    },
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

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startBadgeWorker().catch((error) => {
    console.error("Failed to start badge worker:", error);
    process.exit(1);
  });
}

export { startBadgeWorker };
