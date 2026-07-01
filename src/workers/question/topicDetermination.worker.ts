import { Worker } from "bullmq";

import processTopicDeterminationJob from "../../services/question/worker/topicDetermination.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "topicDeterminationQueue",
    async (job) => {
      await processTopicDeterminationJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
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
}

startWorker().catch((error) => {
  console.error("Failed to start topic determination worker:", error);
  process.exit(1);
});
