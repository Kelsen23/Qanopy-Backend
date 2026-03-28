import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import processContent from "../services/moderation/processContent.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting report moderation worker...");

  const worker = new Worker(
    "contentModerationQueue",
    async (job) => {
      try {
        const contentType = job.name as "Question" | "Answer" | "Reply";
        const { contentId, version } = job.data;

        await processContent(contentId, contentType, version);
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
  console.error("Failed to start moderation worker:", error);
  process.exit(1);
});
