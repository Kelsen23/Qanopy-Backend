import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const statsQueue = new Queue("statsQueue", {
  connection: redisMessagingClientConnection,
});

export default statsQueue;
