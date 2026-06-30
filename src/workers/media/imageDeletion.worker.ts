import { Worker } from "bullmq";

import processImageDeletionJob from "../../services/media/worker/imageDeletion.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const worker = new Worker(
  "imageDeletionQueue",
  async (job) => {
    await processImageDeletionJob(job.name, job.data);
  },
  {
    connection: redisMessagingClientConnection,
    concurrency: 5,
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
