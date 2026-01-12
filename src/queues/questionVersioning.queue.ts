import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionVersioningQueue = new Queue("questionVersioningQueue", {
  connection: redisMessagingClientConnection,
});

export default questionVersioningQueue;
