import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const aiSuggestionQueue = new Queue("aiSuggestionQueue", {
  connection: redisMessagingClientConnection,
});

export default aiSuggestionQueue;
