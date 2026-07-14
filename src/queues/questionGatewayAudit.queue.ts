import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionGatewayAuditQueue = new Queue(
  "questionGatewayAuditQueue",
  {
    connection: redisMessagingClientConnection,
  },
);

export default questionGatewayAuditQueue;
