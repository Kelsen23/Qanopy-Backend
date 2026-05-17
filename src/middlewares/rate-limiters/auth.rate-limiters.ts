import { RateLimiterRedis } from "rate-limiter-flexible";

import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

import type { Request } from "express";

const loginLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:login",
  points: 10,
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
  points: 10,
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
  points: 5,
  duration: 15 * 60,
});

const passwordResetLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:password-reset",
  points: 5,
  duration: 60 * 60,
});

const userEmailVerificationLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:user:email-verification",
  points: 10,
  duration: 60 * 60,
});

const userResendEmailLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:user:resend-email",
  points: 5,
  duration: 15 * 60,
});

const userPasswordChangeLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:user:password-change",
  points: 8,
  duration: 60 * 60,
});

const sessionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "auth:session",
  points: 300,
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
  "Too many email resend requests from this IP, please wait before requesting again",
);

const passwordResetLimiterMiddleware = createRateLimiterMiddleware(
  passwordResetLimiter,
  "Too many password reset requests from this IP, please try again after an hour",
);

const userEmailVerificationLimiterMiddleware = createRateLimiterMiddleware(
  userEmailVerificationLimiter,
  "Too many email verification requests from this account, please try again later",
  (req) => (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown",
);

const userResendEmailLimiterMiddleware = createRateLimiterMiddleware(
  userResendEmailLimiter,
  "Too many email resend requests from this account, please wait before requesting again",
  (req) => (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown",
);

const userPasswordChangeLimiterMiddleware = createRateLimiterMiddleware(
  userPasswordChangeLimiter,
  "Too many password change attempts from this account, please try again after an hour",
  (req) => (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown",
);

const sessionLimiterMiddleware = createRateLimiterMiddleware(
  sessionLimiter,
  "Too many requests, please wait before requesting again",
);

export {
  loginLimiterMiddleware,
  registerLimiterMiddleware,
  oauthLimiterMiddleware,
  emailVerificationLimiterMiddleware,
  resendEmailLimiterMiddleware,
  passwordResetLimiterMiddleware,
  userEmailVerificationLimiterMiddleware,
  userResendEmailLimiterMiddleware,
  userPasswordChangeLimiterMiddleware,
  sessionLimiterMiddleware,
};
