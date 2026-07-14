import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const securityVerifierQueue = new Queue("securityVerifierQueue", {
  connection: redisMessagingClientConnection,
});

export default securityVerifierQueue;
