import { RateLimiterRedis } from "rate-limiter-flexible";
import type { Request } from "express";

import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const userKeyResolver = (req: Request) =>
  (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown";

const createReportLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "moderation:user:report:create",
  points: 8,
  duration: 60 * 10,
});

const createReportLimiterMiddleware = createRateLimiterMiddleware(
  createReportLimiter,
  "Too many reports from this account, please try again later",
  userKeyResolver,
);

export { createReportLimiterMiddleware };
