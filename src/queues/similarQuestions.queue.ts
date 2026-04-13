import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const similarQuestionsQueue = new Queue("similarQuestionsQueue", {
  connection: redisMessagingClientConnection,
});

export default similarQuestionsQueue;
