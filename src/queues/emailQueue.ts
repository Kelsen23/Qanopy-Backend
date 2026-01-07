import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.js";

const emailQueue = new Queue("emailQueue", {
  connection: redisMessagingClientConnection,
});

export default emailQueue;
