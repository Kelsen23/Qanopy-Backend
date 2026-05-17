import { RateLimiterRedis } from "rate-limiter-flexible";

import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const loginLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:login",
  points: 5,
  duration: 15 * 60,
});

const registerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:register",
  points: 5,
  duration: 30 * 60,
});

const oauthLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:oauth",
  points: 5,
  duration: 30 * 60,
});

const emailVerificationLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:email-verification",
  points: 10,
  duration: 60 * 60,
});

const resendEmailLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:resend-email",
  points: 3,
  duration: 5 * 60,
});

const passwordResetLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:password-reset",
  points: 5,
  duration: 60 * 60,
});

const passwordChangeLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:password-change",
  points: 5,
  duration: 60 * 60,
});

const sessionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:session",
  points: 1000,
  duration: 10 * 60,
});

const loginLimiterMiddleware = createRateLimiterMiddleware(
  loginLimiter,
  "Too many login attempts from this IP, please try again after 15 minutes",
);

const registerLimiterMiddleware = createRateLimiterMiddleware(
  registerLimiter,
  "Too many accounts created from this IP, please try again after 30 minutes",
);

const oauthLimiterMiddleware = createRateLimiterMiddleware(
  oauthLimiter,
  "Too many OAuth attempts from this IP, please try again after 30 minutes",
);

const emailVerificationLimiterMiddleware = createRateLimiterMiddleware(
  emailVerificationLimiter,
  "Too many email verification requests, please try again later",
);

const resendEmailLimiterMiddleware = createRateLimiterMiddleware(
  resendEmailLimiter,
  "Too many email resend requests, please wait before requesting again",
);

const passwordResetLimiterMiddleware = createRateLimiterMiddleware(
  passwordResetLimiter,
  "Too many password reset requests from this IP, please try again after an hour",
);

const passwordChangeLimiterMiddleware = createRateLimiterMiddleware(
  passwordChangeLimiter,
  "Too many password change attempts from this IP, please try again after an hour",
);

const sessionLimiterMiddleware = createRateLimiterMiddleware(
  sessionLimiter,
  "Too many requests please wait before requesting again",
);

export {
  loginLimiterMiddleware,
  registerLimiterMiddleware,
  oauthLimiterMiddleware,
  emailVerificationLimiterMiddleware,
  resendEmailLimiterMiddleware,
  passwordResetLimiterMiddleware,
  passwordChangeLimiterMiddleware,
  sessionLimiterMiddleware,
};
