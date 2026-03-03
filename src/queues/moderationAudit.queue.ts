import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const moderationAudit = new Queue("moderationAuditQueue", {
  connection: redisMessagingClientConnection,
});

export default moderationAudit;
