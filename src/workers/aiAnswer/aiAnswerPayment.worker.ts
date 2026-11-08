import { Worker } from "bullmq";

import processAiAnswerPayment from "../../services/question/worker/aiAnswerPayment.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const handlers = createWorkerEventHandlers("aiAnswerPayment");
  const worker = new Worker(
    "aiAnswerPayment",
    async (job) => {
      await processAiAnswerPayment(job.data);
    },
    { connection: redisMessagingClientConnection, concurrency: 2 },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start AI Answer payment worker:", error);
  process.exit(1);
});
