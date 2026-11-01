import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const aiAnswerPlannerQueue = new Queue("aiAnswerPlanner", {
  connection: redisMessagingClientConnection,
});

export default aiAnswerPlannerQueue;
