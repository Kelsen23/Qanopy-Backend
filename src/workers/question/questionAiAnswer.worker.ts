import { Worker } from "bullmq";

import processQuestionAiAnswerJob from "../../services/question/worker/questionAiAnswer.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question AI answer worker...");

  const handlers = createWorkerEventHandlers("questionAiAnswer");

  const worker = new Worker(
    "questionAiAnswerQueue",
    async (job) => {
      const { userId, questionId, version, creditCharge } = job.data;
      await processQuestionAiAnswerJob({
        userId,
        questionId,
        version,
        jobId: String(job.id),
        creditCharge,
      });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 2,
      limiter: { max: 2, duration: 1000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start question AI answer worker:", error);
  process.exit(1);
});
