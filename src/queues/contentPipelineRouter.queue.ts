import { Queue } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

const contentPipelineRouter = new Queue("contentPipelineRouter", {
  connection: redisMessagingClientConnection,
});

export default contentPipelineRouter;
