import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import prisma from "../config/prisma.config.js";

import HttpError from "../utils/httpError.util.js";

new Worker(
  "moderationMetricsQueue",
  async (job) => {
    const { userId } = job.data;

    switch (job.name) {
      case "BAN_PERM": {
        const stats = await prisma.moderationStats.findUnique({
          where: { userId },
        });
        if (!stats) throw new HttpError("Moderation stats not found", 404);

        const newTrust = Math.max(0, Math.min(1, stats.trustScore - 0.25));

        await prisma.moderationStats.update({
          where: { userId },
          data: {
            totalStrikes: { increment: 1 },
            lastStrikeAt: new Date(),
            trustScore: newTrust,
          },
        });
        break;
      }

      case "BAN_TEMP": {
        const stats = await prisma.moderationStats.findUnique({
          where: { userId },
        });
        if (!stats) throw new HttpError("Moderation stats not found", 404);

        const newTrust = Math.max(0, Math.min(1, stats.trustScore - 0.1));

        await prisma.moderationStats.update({
          where: { userId },
          data: {
            totalStrikes: { increment: 1 },
            rejectedCount: { increment: 1 },
            lastStrikeAt: new Date(),
            trustScore: newTrust,
          },
        });
        break;
      }

      case "WARN": {
        const stats = await prisma.moderationStats.findUnique({
          where: { userId },
        });
        if (!stats) throw new HttpError("Moderation stats not found", 404);

        const newTrust = Math.max(0, Math.min(1, stats.trustScore - 0.03));

        await prisma.moderationStats.update({
          where: { userId },
          data: {
            totalStrikes: { increment: 1 },
            flaggedCount: { increment: 1 },
            lastStrikeAt: new Date(),
            trustScore: newTrust,
          },
        });
        break;
      }

      case "IGNORE": {
        const stats = await prisma.moderationStats.findUnique({
          where: { userId },
        });
        if (!stats) throw new HttpError("Moderation stats not found", 404);

        const newTrust = Math.min(1, stats.trustScore + 0.01);

        await prisma.moderationStats.update({
          where: { userId },
          data: {
            trustScore: newTrust,
          },
        });
        break;
      }
    }
  },
  {
    connection: redisMessagingClientConnection,
    concurrency: 10,
    limiter: {
      max: 15,
      duration: 1000,
    },
  },
);
