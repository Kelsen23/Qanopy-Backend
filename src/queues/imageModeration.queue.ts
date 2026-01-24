import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const imageModerationQueue = new Queue("imageModerationQueue", {
  connection: redisMessagingClientConnection,
});

export default imageModerationQueue;
