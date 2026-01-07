import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.js";

const questionVersioningQueue = new Queue("questionVersioningQueue", {
  connection: redisMessagingClientConnection,
});

export default questionVersioningQueue;
