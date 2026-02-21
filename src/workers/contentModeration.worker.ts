import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import processContent from "../services/moderation/processContent.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting report moderation worker...");

  new Worker(
    "contentModerationQueue",
    async (job) => {
      try {
        const { contentId, contentType, version } = job.data;

        await processContent(contentId, contentType, version);
      } catch (error) {
        console.error("Error processing moderation report:", error);
        throw error;
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: { max: 5, duration: 6000 },
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start moderation worker:", error);
  process.exit(1);
});
