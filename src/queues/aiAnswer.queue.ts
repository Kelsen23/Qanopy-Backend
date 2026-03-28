import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const aiAnswerQueue = new Queue("aiAnswerQueue", {
  connection: redisMessagingClientConnection,
});

export default aiAnswerQueue;
