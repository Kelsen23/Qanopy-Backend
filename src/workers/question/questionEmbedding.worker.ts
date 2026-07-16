import { Worker } from "bullmq";

import processQuestionEmbeddingJob from "../../services/question/worker/questionEmbedding.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const handlers = createWorkerEventHandlers("questionEmbedding");

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

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((err) => {
  console.error("Failed to start embedding worker:", err);
  process.exit(1);
});
