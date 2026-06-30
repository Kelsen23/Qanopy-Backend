import { Worker } from "bullmq";

import processSimilarQuestionsJob from "../../services/question/worker/similarQuestions.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting similar questions worker...");

  const worker = new Worker(
    "similarQuestionsQueue",
    async (job) => {
      await processSimilarQuestionsJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
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
  console.error("Failed to start similar questions worker:", error);
  process.exit(1);
});
