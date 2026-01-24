import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const createReportLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "createReport",
  points: 5,
  duration: 60 * 10,
});

const moderateContentImageLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "moderateContentImage",
  points: 15,
  duration: 60 * 60,
});

const createReportLimiterMiddleware = createRateLimiterMiddleware(
  createReportLimiter,
  "Too many reports, try again later",
);

const moderateContentImageLimiterMiddleware = createRateLimiterMiddleware(
  moderateContentImageLimiter,
  "Too many image uploads, try again later",
);

export { createReportLimiterMiddleware, moderateContentImageLimiterMiddleware };
