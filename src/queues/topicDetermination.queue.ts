import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const topicDeterminationQueue = new Queue("topicDeterminationQueue", {
  connection: redisMessagingClientConnection,
});

export default topicDeterminationQueue;
