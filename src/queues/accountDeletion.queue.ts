import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

const accountDeletionQueue = new Queue("accountDeletionQueue", {
  connection: redisMessagingClientConnection,
});

export default accountDeletionQueue;
