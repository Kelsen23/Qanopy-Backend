import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionEligibilityGateQueue = new Queue("questionEligibilityGateQueue", {
  connection: redisMessagingClientConnection,
});

export default questionEligibilityGateQueue;
