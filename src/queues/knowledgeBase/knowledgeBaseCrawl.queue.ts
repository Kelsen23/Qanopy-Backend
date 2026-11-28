import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const knowledgeBaseCrawlQueue = new Queue("knowledgeBaseCrawlQueue", {
  connection: redisMessagingClientConnection,
});

export default knowledgeBaseCrawlQueue;
