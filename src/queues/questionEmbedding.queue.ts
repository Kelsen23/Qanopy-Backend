import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionEmbeddingQueue = new Queue("questionEmbeddingQueue", {
  connection: redisMessagingClientConnection,
});

export default questionEmbeddingQueue;
