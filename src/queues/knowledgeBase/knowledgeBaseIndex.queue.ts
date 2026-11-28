import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const knowledgeBaseIndexQueue = new Queue("knowledgeBaseIndexQueue", {
  connection: redisMessagingClientConnection,
});

export default knowledgeBaseIndexQueue;
