import { Queue } from "bullmq";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const aiAnswerPaymentQueue = new Queue("aiAnswerPayment", {
  connection: redisMessagingClientConnection,
});

export default aiAnswerPaymentQueue;
