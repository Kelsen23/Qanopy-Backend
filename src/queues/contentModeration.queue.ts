import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const contentModerationQueue = new Queue("contentModerationQueue", {
  connection: redisMessagingClientConnection,
});

export default contentModerationQueue;
