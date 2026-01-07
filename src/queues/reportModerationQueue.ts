import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.js";

const reportModerationQueue = new Queue("reportModerationQueue", {
  connection: redisMessagingClientConnection,
});

export default reportModerationQueue;
