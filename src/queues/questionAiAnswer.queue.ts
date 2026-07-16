import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionAiAnswerQueue = new Queue("questionAiAnswerQueue", {
  connection: redisMessagingClientConnection,
});

export default questionAiAnswerQueue;
