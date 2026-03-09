import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const deleteContentQueue = new Queue("deleteContentQueue", {
  connection: redisMessagingClientConnection,
});

export default deleteContentQueue;
