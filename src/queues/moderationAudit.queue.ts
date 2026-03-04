import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const moderationAuditQueue = new Queue("moderationAuditQueue", {
  connection: redisMessagingClientConnection,
});

export default moderationAuditQueue;
