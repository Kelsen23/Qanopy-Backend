import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const unverifiedAccountCleanupQueue = new Queue(
  "unverifiedAccountCleanupQueue",
  {
    connection: redisMessagingClientConnection,
  },
);

export default unverifiedAccountCleanupQueue;
