import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const userInterestQueue = new Queue("userInterestQueue", {
  connection: redisMessagingClientConnection,
});

export default userInterestQueue;
