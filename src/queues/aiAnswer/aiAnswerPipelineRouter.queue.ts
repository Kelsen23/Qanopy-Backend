import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const aiAnswerPipelineRouterQueue = new Queue("aiAnswerPipelineRouter", {
  connection: redisMessagingClientConnection,
});

export default aiAnswerPipelineRouterQueue;
