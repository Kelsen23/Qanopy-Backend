import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const contentFinalizeQueue = new Queue("contentFinalizeQueue", {
  connection: redisMessagingClientConnection,
});

export default contentFinalizeQueue;
