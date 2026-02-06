import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";

import updateProfilePictureService from "../services/user/updateProfilePicture.service.js";
import processContentImage from "../services/moderation/processContentImage.service.js";

const worker = new Worker(
  "imageModerationQueue",
  async (job) => {
    const { userId, objectKey } = job.data;

    switch (job.name) {
      case "profilePicture":
        await updateProfilePictureService(userId, objectKey);
        break;

      case "content":
        await processContentImage(userId, objectKey);
        break;

      default:
        throw new HttpError("Invalid job type", 500);
    }
  },

  {
    connection: redisMessagingClientConnection,
    concurrency: 1,
    limiter: {
      max: 10,
      duration: 1000,
    },
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
