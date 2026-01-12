import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const emailQueue = new Queue("emailQueue", {
  connection: redisMessagingClientConnection,
});

export default emailQueue;
