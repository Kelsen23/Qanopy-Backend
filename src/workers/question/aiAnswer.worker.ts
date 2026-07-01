import { Worker } from "bullmq";

import processAiAnswerJob from "../../services/question/worker/aiAnswer.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting ai answer worker...");

  const worker = new Worker(
    "aiAnswerQueue",
    async (job) => {
      const { userId, questionId, version } = job.data;
      await processAiAnswerJob({
        userId,
        questionId,
        version,
        jobId: String(job.id),
      });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 2,
      limiter: { max: 2, duration: 1000 },
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
  console.error("Failed to start ai answer worker:", error);
  process.exit(1);
});
