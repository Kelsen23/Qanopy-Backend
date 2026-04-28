import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const updateProfilePictureLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "updateProfilePicture",
  points: 4,
  duration: 60 * 60,
});

const updateProfileLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "updateProfile",
  points: 3,
  duration: 15 * 60,
});

const updateProfilePictureLimiterMiddleware = createRateLimiterMiddleware(
  updateProfilePictureLimiter,
  "Too many profile picture updates, try again after an hour",
);

const updateProfileLimiterMiddleware = createRateLimiterMiddleware(
  updateProfileLimiter,
  "Too many update profile attempts from this IP, please try again after 15 minutes",
);

export {
  updateProfilePictureLimiterMiddleware,
  updateProfileLimiterMiddleware,
};
