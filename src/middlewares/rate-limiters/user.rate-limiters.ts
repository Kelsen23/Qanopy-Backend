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

const getInterestsLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "getInterests",
  points: 10,
  duration: 2 * 60,
});

const saveInterestsLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "saveInterests",
  points: 5,
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

const getInterestsLimiterMiddleware = createRateLimiterMiddleware(
  getInterestsLimiter,
  "Too many get interests requests from this IP, please try again after 2 minutes",
);

const saveInterestsLimiterMiddleware = createRateLimiterMiddleware(
  saveInterestsLimiter,
  "Too many save interests requests from this IP, please try again later",
);

export {
  updateProfilePictureLimiterMiddleware,
  updateProfileLimiterMiddleware,
  getInterestsLimiterMiddleware,
  saveInterestsLimiterMiddleware,
};
