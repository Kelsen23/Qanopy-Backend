import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const notificationQueue = new Queue("notificationQueue", {
  connection: redisMessagingClientConnection,
});

export default notificationQueue;
