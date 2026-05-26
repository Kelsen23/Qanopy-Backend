import { RateLimiterRedis } from "rate-limiter-flexible";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

import { getRedisMessagingClient } from "../../config/redis.config.js";
import type { Request } from "express";

const userKeyResolver = (req: Request) =>
  (req as Request & { user?: { id?: string } }).user?.id || "unknown-user";

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
  userNotificationsSeenLimiterMiddleware,
};
