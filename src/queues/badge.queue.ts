import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const badgeQueue = new Queue("badgeQueue", {
  connection: redisMessagingClientConnection,
});

export default badgeQueue;
