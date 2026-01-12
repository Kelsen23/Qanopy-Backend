import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const uploadProfilePictureLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "uploadProfilePicture",
  points: 3,
  duration: 60 * 60,
});

const uploadProfilePictureLimiterMiddleware = createRateLimiterMiddleware(
  uploadProfilePictureLimiter,
  "Too many profile picture changes, try again after an hour",
);

export { uploadProfilePictureLimiterMiddleware };
