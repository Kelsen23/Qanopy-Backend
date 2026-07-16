import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionAiSuggestionQueue = new Queue("questionAiSuggestionQueue", {
  connection: redisMessagingClientConnection,
});

export default questionAiSuggestionQueue;
