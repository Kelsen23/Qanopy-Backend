import { Worker } from "bullmq";

import processQuestionSecurityVerifierJob from "../../services/question/worker/questionSecurityVerifier.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question security verifier worker...");

  const handlers = createWorkerEventHandlers("questionSecurityVerifier");

  const worker = new Worker(
    "questionSecurityVerifierQueue",
    async (job) => {
      await processQuestionSecurityVerifierJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 5, duration: 1000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start question security verifier worker:", error);
  process.exit(1);
});
