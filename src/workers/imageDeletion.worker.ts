import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";

import deleteSingleImage from "../services/media/deleteSingleImage.service.js";
import deleteImagesFromBody from "../services/media/deleteImageFromBody.service.js";

const worker = new Worker(
  "imageDeletionQueue",
  async (job) => {
    switch (job.name) {
      case "deleteSingle":
        await deleteSingleImage(job.data);
        break;
      case "deleteFromBody":
        await deleteImagesFromBody(job.data);
        break;
      default:
        throw new HttpError("Invalid job type", 500);
    }
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
