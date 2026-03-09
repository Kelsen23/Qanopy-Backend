import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const moderationMetricsQueue = new Queue("moderationMetricsQueue", {
  connection: redisMessagingClientConnection,
});

export default moderationMetricsQueue;
