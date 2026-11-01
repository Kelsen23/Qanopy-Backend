import { Worker } from "bullmq";

import routeAiAnswerGeneration from "../../services/question/pipelineRouter/aiAnswer/aiAnswerPipelineRouter.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const handlers = createWorkerEventHandlers("aiAnswerPipelineRouter");

  const worker = new Worker(
    "aiAnswerPipelineRouter",
    async (job) => {
      await routeAiAnswerGeneration(job.data);
    },
    { connection: redisMessagingClientConnection, concurrency: 10 },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start AI Answer pipeline router worker:", error);
  process.exit(1);
});
