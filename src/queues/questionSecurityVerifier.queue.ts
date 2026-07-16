import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const questionSecurityVerifierQueue = new Queue(
  "questionSecurityVerifierQueue",
  {
    connection: redisMessagingClientConnection,
  },
);

export default questionSecurityVerifierQueue;
