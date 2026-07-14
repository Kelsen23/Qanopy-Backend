import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processQuestionGatewayAuditJob from "../../services/question/worker/questionGatewayAudit.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startQuestionGatewayAuditWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question gateway audit worker...");

  const worker = new Worker(
    "questionGatewayAuditQueue",
    async (job) => {
      await processQuestionGatewayAuditJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 15,
      limiter: { max: 15, duration: 1000 },
    },
  );

  const handlers = createWorkerEventHandlers("questionGatewayAudit");
  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startQuestionGatewayAuditWorker().catch((error) => {
    console.error("Failed to start question gateway audit worker:", error);
    process.exit(1);
  });
}

export { startQuestionGatewayAuditWorker };
