import { Worker } from "bullmq";

import processContentFinalizeJob, {
  assertContentFinalizeJobName,
} from "../../services/question/worker/contentFinalize.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
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

  worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`Job ${job?.id} failed:`, err),
  );
  worker.on("error", (err) => console.error("Worker crashed:", err));
}

startWorker().catch((error) => {
  console.error("Failed to start content image finalization worker:", error);
  process.exit(1);
});
