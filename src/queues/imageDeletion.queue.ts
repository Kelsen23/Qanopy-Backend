import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const imageDeletionQueue = new Queue("imageDeletionQueue", {
  connection: redisMessagingClientConnection,
});

export default imageDeletionQueue;
