import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import updateProfilePictureService from "../services/user/updateProfilePicture.service.js";
import HttpError from "../utils/httpError.util.js";
import processContentImage from "../services/moderation/processContentImage.service.js";

new Worker(
  "imageModerationQueue",
  async (job) => {
    const { userId, type, objectKey } = job.data;

    if (type === "profilePicture") {
      updateProfilePictureService(userId, objectKey);
    } else if (type === "content") {
      processContentImage(userId, objectKey);
    } else throw new HttpError("Invalid type", 500);
  },

  {
    connection: redisMessagingClientConnection,
    concurrency: 1,
    limiter: { max: 5, duration: 6000 },
  },
);
