import { Worker } from "bullmq";

import processContentPipelineRouterJob from "../../services/question/worker/contentPipelineRouter.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Content pipeline router worker started...");

  const worker = new Worker(
    "contentPipelineRouter",
    async (job) => {
      await processContentPipelineRouterJob(
        job.name as any,
        job.data.contentId,
        job.data.version,
      );
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 25,
      limiter: { max: 25, duration: 5000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Router job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Router job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Router worker crashed:", err);
  });
}

startWorker().catch((err) => {
  console.error("Failed to start router worker:", err);
  process.exit(1);
});
