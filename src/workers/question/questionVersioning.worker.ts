import { Worker } from "bullmq";

import processQuestionVersioningJob from "../../services/question/worker/questionVersioning.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question versioning worker...");

  const worker = new Worker(
    "questionVersioningQueue",
    async (job) => {
      await processQuestionVersioningJob(job.data);
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
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
}

startWorker().catch((error) => {
  console.error("Failed to start question versioning worker:", error);
  process.exit(1);
});
