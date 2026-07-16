import { Worker } from "bullmq";

import processQuestionVersioningJob from "../../services/question/worker/questionVersioning.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question versioning worker...");

  const handlers = createWorkerEventHandlers("questionVersioning");

  const worker = new Worker(
    "questionVersioningQueue",
    async (job) => {
      await processQuestionVersioningJob(job.data);
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start question versioning worker:", error);
  process.exit(1);
});
