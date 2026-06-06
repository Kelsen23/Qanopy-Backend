import { User } from "../../generated/prisma/index.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import sanitizeUser from "../../utils/sanitizeUser.util.js";
import sanitizeUserForAuth from "../../utils/sanitizeUserForAuth.util.js";

import {
  cleanupExpiredUnverifiedUserById,
  isExpiredUnverifiedLocalUser,
} from "./unverifiedAccountCleanup.service.js";

const AUTH_CACHE_TTL_SECONDS = 60 * 20;

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

const cacheUser = async (user: User) => {
  await getRedisCacheClient().set(
    `user:${user.id}`,
    JSON.stringify(sanitizeUser(user)),
    "EX",
    AUTH_CACHE_TTL_SECONDS,
  );
};

const cacheAuthUser = async (user: User) => {
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

const handleExpiredUnverifiedUser = async (
  user: Pick<User, "id" | "createdAt" | "authProvider" | "isVerified">,
) => {
  if (user.isVerified || !isExpiredUnverifiedLocalUser(user)) return false;

  await cleanupExpiredUnverifiedUserById(user.id);
  return true;
};

export type { DeviceInfo };
export {
  AUTH_CACHE_TTL_SECONDS,
  getDeviceIp,
  cacheUser,
  cacheAuthUser,
  removeResetPasswordAttempts,
  handleExpiredUnverifiedUser,
};
