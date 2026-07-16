import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const similarQuestionSearchQueue = new Queue("similarQuestionSearchQueue", {
  connection: redisMessagingClientConnection,
});

export default similarQuestionSearchQueue;
