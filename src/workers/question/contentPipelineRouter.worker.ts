import { Worker } from "bullmq";

import processContentPipelineRouterJob from "../../services/question/worker/contentPipelineRouter.service.js";
import { normalizePipelineRouterJobData } from "../../services/question/pipelineRouter/pipelineRouter.shared.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Content pipeline router worker started...");

  const handlers = createWorkerEventHandlers("contentPipelineRouter");

  const worker = new Worker(
    "contentPipelineRouter",
    async (job) => {
      await processContentPipelineRouterJob(
        normalizePipelineRouterJobData({
          jobName: job.name,
          contentId: job.data.contentId,
          version: job.data.version,
          moderationRevision: job.data.moderationRevision,
        }),
      );
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 25,
      limiter: { max: 25, duration: 5000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((err) => {
  console.error("Failed to start router worker:", err);
  process.exit(1);
});
