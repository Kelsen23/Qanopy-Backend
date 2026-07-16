import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import updateProfilePictureService from "../../services/user/updateProfilePicture.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);
const handlers = createWorkerEventHandlers("imageModeration");

async function startImageModerationWorker() {
  const worker = new Worker(
    "imageModerationQueue",
    async (job) => {
      const { userId, objectKey, uploadFingerprint } = job.data;

      switch (job.name) {
        case "PROFILE_PICTURE":
          await updateProfilePictureService(
            userId,
            objectKey,
            uploadFingerprint,
          );
          break;

        default:
          throw new Error("Invalid job type");
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

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startImageModerationWorker().catch((error) => {
    console.error("Failed to start image moderation worker:", error);
    process.exit(1);
  });
}

export { startImageModerationWorker };
