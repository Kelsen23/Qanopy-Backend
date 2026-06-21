import { RateLimiterRedis } from "rate-limiter-flexible";
import type { Request } from "express";

import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const userKeyResolver = (req: Request) =>
  (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown";

const profilePictureUpdateLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:profile-picture:update",
  points: 4,
  duration: 60 * 60,
});

const profilePictureDeleteLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:profile-picture:delete",
  points: 4,
  duration: 60 * 60,
});

const profileUpdateLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:profile:update",
  points: 6,
  duration: 60 * 60,
});

const accountDeletionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:account:deletion",
  points: 2,
  duration: 60 * 60,
});

const notificationSettingsLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:notifications:settings",
  points: 12,
  duration: 60 * 60,
});

const emailChangeSendLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:email-change:send",
  points: 5,
  duration: 60 * 60,
});

const emailChangeResendLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:email-change:resend",
  points: 5,
  duration: 15 * 60,
});

const emailChangeVerifyLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:email-change:verify",
  points: 10,
  duration: 60 * 60,
});

const notificationsSeenLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "user:notifications:seen",
  points: 120,
  duration: 60 * 60,
});

const userProfilePictureUpdateLimiterMiddleware = createRateLimiterMiddleware(
  profilePictureUpdateLimiter,
  "Too many profile picture updates from this account, please try again later",
  userKeyResolver,
);

const userProfilePictureDeleteLimiterMiddleware = createRateLimiterMiddleware(
  profilePictureDeleteLimiter,
  "Too many profile picture deletions from this account, please try again later",
  userKeyResolver,
);

const userProfileUpdateLimiterMiddleware = createRateLimiterMiddleware(
  profileUpdateLimiter,
  "Too many profile updates from this account, please try again later",
  userKeyResolver,
);

const userAccountDeletionLimiterMiddleware = createRateLimiterMiddleware(
  accountDeletionLimiter,
  "Too many account deletion requests from this account, please try again later",
  userKeyResolver,
);

const userNotificationSettingsLimiterMiddleware = createRateLimiterMiddleware(
  notificationSettingsLimiter,
  "Too many notification settings updates from this account, please try again later",
  userKeyResolver,
);

const userEmailChangeSendLimiterMiddleware = createRateLimiterMiddleware(
  emailChangeSendLimiter,
  "Too many email change requests from this account, please try again later",
  userKeyResolver,
);

const userEmailChangeResendLimiterMiddleware = createRateLimiterMiddleware(
  emailChangeResendLimiter,
  "Too many email change resend requests from this account, please wait before requesting again",
  userKeyResolver,
);

const userEmailChangeVerifyLimiterMiddleware = createRateLimiterMiddleware(
  emailChangeVerifyLimiter,
  "Too many email change verification attempts from this account, please try again later",
  userKeyResolver,
);

const userNotificationsSeenLimiterMiddleware = createRateLimiterMiddleware(
  notificationsSeenLimiter,
  "Too many notification read requests from this account, please try again later",
  userKeyResolver,
);

export {
  userProfilePictureUpdateLimiterMiddleware,
  userProfilePictureDeleteLimiterMiddleware,
  userProfileUpdateLimiterMiddleware,
  userAccountDeletionLimiterMiddleware,
  userNotificationSettingsLimiterMiddleware,
  userEmailChangeSendLimiterMiddleware,
  userEmailChangeResendLimiterMiddleware,
  userEmailChangeVerifyLimiterMiddleware,
  userNotificationsSeenLimiterMiddleware,
};
