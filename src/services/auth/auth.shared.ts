import { User } from "../../generated/prisma/index.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import sanitizeUser from "../../utils/sanitizeUser.util.js";
import sanitizeUserForAuth from "../../utils/sanitizeUserForAuth.util.js";

import queueBadgeAward from "../user/badge/queueBadgeAward.service.js";

import {
  cleanupExpiredUnverifiedUserById,
  isExpiredUnverifiedLocalUser,
} from "./unverifiedAccountCleanup.service.js";

const AUTH_CACHE_TTL_SECONDS = 60 * 5;
const APP_STAGE_CACHE_KEY = "app:stage";
const APP_STAGE_CACHE_TTL_SECONDS = 60;
const DEFAULT_REGISTERED_STAGE = "DEMO";

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

const getRegisteredStage = async () => {
  const cachedAppStage = await getRedisCacheClient().get(APP_STAGE_CACHE_KEY);

  if (cachedAppStage) {
    return cachedAppStage;
  }

  const appStage = await prisma.appConfig.findUnique({
    where: { key: "appStage" },
    select: { value: true },
  });

  const registeredStage = appStage?.value ?? DEFAULT_REGISTERED_STAGE;

  await getRedisCacheClient().set(
    APP_STAGE_CACHE_KEY,
    registeredStage,
    "EX",
    APP_STAGE_CACHE_TTL_SECONDS,
  );

  return registeredStage;
};

const handleExpiredUnverifiedUser = async (
  user: Pick<User, "id" | "createdAt" | "authProvider" | "isVerified">,
) => {
  if (user.isVerified || !isExpiredUnverifiedLocalUser(user)) return false;

  await cleanupExpiredUnverifiedUserById(user.id);
  return true;
};

const queueBadgeAwardSafely = async (userId: string) => {
  try {
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
