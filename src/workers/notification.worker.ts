import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import prisma from "../config/prisma.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import Notification from "../models/notification.model.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";
import { clearNotificationCache } from "../utils/clearCache.util.js";

import { getUserSockets } from "../services/redis/presence.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting notification worker...");

  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      const { recipientId, actorId, event, target, meta } = job.data;
      const normalizedMeta = meta ?? {};

      try {
        const notification = await Notification.create({
          recipientId,
          actorId,
          event,
          target,
          meta: normalizedMeta,
        });

        const sockets = await getUserSockets(recipientId);

        let actor = null;

        if (sockets.length > 0) {
          if (actorId) {
            actor = await prisma.user.findUnique({
              where: { id: actorId },
              select: {
                id: true,
                username: true,
                profilePictureKey: true,
                profilePictureUrl: true,
              },
            });
          }

          await publishSocketEvent(recipientId, "notification", {
            id: notification._id,
            actorId,
            actor,
            event,
            target,
            meta: normalizedMeta,
            seen: false,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt,
          });
        }

        await clearNotificationCache(recipientId);
      } catch (error) {
        console.error("Failed to process notification job:", error);
        throw error;
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 15,
      limiter: { max: 15, duration: 1000 },
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
  console.error("Failed to start notification worker:", error);
  process.exit(1);
});
