import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processAccountDeletion from "../../services/user/processAccountDeletion.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startAccountDeletionWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting account deletion worker...");

  const worker = new Worker(
    "accountDeletionQueue",
    async (job) => {
      await processAccountDeletion(
        job.data as { userId: string; profilePictureKey?: string | null },
      );
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: { max: 5, duration: 5000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Worker crashed:", err);
  });

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startAccountDeletionWorker().catch((error) => {
    console.error("Failed to start account deletion worker:", error);
    process.exit(1);
  });
}

export { startAccountDeletionWorker };
