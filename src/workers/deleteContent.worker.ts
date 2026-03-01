import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

import deleteContent from "../services/question/deleteContent.service.js";

new Worker(
  "deleteContentQueue",
  async (job) => {
    const { userId, targetType, targetId } = job.data;

    await deleteContent(userId, targetType.toLowerCase(), targetId);
  },
  {
    connection: redisMessagingClientConnection,
    concurrency: 1,
    limiter: { max: 5, duration: 5000 },
  },
);
