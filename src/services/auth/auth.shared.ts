import type { FlattenedUser } from "../user/userData.service.js";

import {
  cleanupExpiredUnverifiedUserById,
  isExpiredUnverifiedLocalUser,
} from "./unverifiedAccountCleanup.service.js";

import appStageConfig from "../../config/appStage.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import sanitizeUser from "../../utils/auth/sanitizeUser.util.js";
import sanitizeUserForAuth from "../../utils/auth/sanitizeUserForAuth.util.js";

const AUTH_CACHE_TTL_SECONDS = 60 * 5;

type DeviceInfo = {
  browser: string;
  os: string;
  ip?: string | string[] | null;
  userAgent?: string;
};

const getDeviceIp = (deviceInfo: DeviceInfo) =>
  Array.isArray(deviceInfo.ip)
    ? deviceInfo.ip[0] || "Unknown IP"
    : deviceInfo.ip || "Unknown IP";

const cacheUser = async (user: FlattenedUser) => {
  await getRedisCacheClient().set(
    `user:${user.id}`,
    JSON.stringify(sanitizeUser(user)),
    "EX",
    AUTH_CACHE_TTL_SECONDS,
  );
};

const cacheAuthUser = async (user: FlattenedUser) => {
  await getRedisCacheClient().set(
    `auth:user:${user.id}`,
    JSON.stringify(sanitizeUserForAuth(user)),
    "EX",
    AUTH_CACHE_TTL_SECONDS,
  );
};

const removeResetPasswordAttempts = async (userId: string) => {
  await getRedisCacheClient().del(`auth:reset-password:attempts:${userId}`);
};

const getRegisteredStage = () => appStageConfig.registrationStage;

const handleExpiredUnverifiedUser = async (
  user: Pick<FlattenedUser, "id" | "createdAt" | "authProvider" | "isVerified">,
) => {
  if (user.isVerified || !isExpiredUnverifiedLocalUser(user)) return false;

  await cleanupExpiredUnverifiedUserById(user.id);
  return true;
};

const queueBadgeAwardSafely = async (userId: string) => {
  try {
    const { default: queueBadgeAward } = await import(
      "../user/badge/queueBadgeAward.service.js"
    );
    await queueBadgeAward({ userId });
  } catch (error) {
    console.warn(`Failed to enqueue badge award for user ${userId}`, error);
  }
};

export type { DeviceInfo };
export {
  AUTH_CACHE_TTL_SECONDS,
  getDeviceIp,
  cacheUser,
  cacheAuthUser,
  removeResetPasswordAttempts,
  getRegisteredStage,
  handleExpiredUnverifiedUser,
  queueBadgeAwardSafely,
};
