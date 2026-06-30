import { Worker } from "bullmq";

import processQuestionEmbeddingJob from "../../services/question/worker/questionEmbedding.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      await processQuestionEmbeddingJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 10,
      limiter: { max: 20, duration: 1000 },
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

startWorker().catch((err) => {
  console.error("Failed to start embedding worker:", err);
  process.exit(1);
});
