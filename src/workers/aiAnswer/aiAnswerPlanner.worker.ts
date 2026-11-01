import { Worker } from "bullmq";

import processAiAnswerPlannerJob from "../../services/question/worker/aiAnswerPlanner.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const handlers = createWorkerEventHandlers("aiAnswerPlanner");

  const worker = new Worker(
    "aiAnswerPlanner",
    async (job) => {
      await processAiAnswerPlannerJob(job.data);
    },
    { connection: redisMessagingClientConnection, concurrency: 2 },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start AI Answer Planner worker:", error);
  process.exit(1);
});
