import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import { redisMessagingClientConnection } from "../../config/redis.config.js";
import connectMongoDB from "../../config/mongodb.config.js";

import processContent from "../../services/moderation/ai/processContent.service.js";
import {
  assertContentModerationJobName,
  createWorkerEventHandlers,
  getModerationRevisionFromJob,
} from "./shared.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content moderation worker...");

  const worker = new Worker(
    "contentModerationQueue",
    async (job) => {
      try {
        const contentType = assertContentModerationJobName(job.name);
        const { contentId, version, moderationRevision } = job.data;

        await processContent(
          contentId,
          contentType,
          getModerationRevisionFromJob(contentType, {
            version,
            moderationRevision,
          }),
        );
      } catch (error) {
        console.error("Error processing moderation report:", error);
        throw error;
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 3,
      limiter: { max: 7, duration: 1000 },
    },
  );

  const handlers = createWorkerEventHandlers("contentModeration");
  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startWorker().catch((error) => {
    console.error("Failed to start moderation worker:", error);
    process.exit(1);
  });
}

export { startWorker };
