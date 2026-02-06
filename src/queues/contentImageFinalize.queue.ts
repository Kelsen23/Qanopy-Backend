import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const contentImageFinalizeQueue = new Queue("contentImageFinalizeQueue", {
  connection: redisMessagingClientConnection,
});

export default contentImageFinalizeQueue;
