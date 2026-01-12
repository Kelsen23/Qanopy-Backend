import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const updateProfileLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "updateProfile",
  points: 3,
  duration: 15 * 60,
});

const getInterestsLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "getInterests",
  points: 10,
  duration: 2 * 60,
});

const saveInterestsLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "saveInterests",
  points: 5,
  duration: 15 * 60,
});

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
  updateProfileLimiterMiddleware,
  getInterestsLimiterMiddleware,
  saveInterestsLimiterMiddleware,
};
