import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processContentFinalizeJob, {
  assertContentFinalizeJobName,
} from "../../services/question/worker/contentFinalize.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);
const handlers = createWorkerEventHandlers("contentFinalize");

async function startContentFinalizeWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting content image finalization worker...");

  const worker = new Worker(
    "contentFinalizeQueue",
    async (job) => {
      await processContentFinalizeJob(
        assertContentFinalizeJobName(job.name),
        job.data,
      );
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startContentFinalizeWorker().catch((error) => {
    console.error("Failed to start content image finalization worker:", error);
    process.exit(1);
  });
}

export { startContentFinalizeWorker };
