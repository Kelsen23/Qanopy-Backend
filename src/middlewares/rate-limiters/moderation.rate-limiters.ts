import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const createReportLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "createReport",
  points: 5,
  duration: 60 * 10,
});

const createReportLimiterMiddleware = createRateLimiterMiddleware(
  createReportLimiter,
  "Too many reports, try again later",
);

export { createReportLimiterMiddleware };
