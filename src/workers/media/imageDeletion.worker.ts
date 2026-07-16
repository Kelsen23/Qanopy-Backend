import { Worker } from "bullmq";

import processImageDeletionJob from "../../services/media/worker/imageDeletion.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const handlers = createWorkerEventHandlers("imageDeletion");
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

worker.on("completed", handlers.completed);
worker.on("failed", handlers.failed);
worker.on("error", handlers.error);
