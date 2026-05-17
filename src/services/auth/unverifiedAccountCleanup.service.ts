import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import publishSocketDisconnect from "../../utils/publishSocketDisconnect.util.js";

import { purgeAccountData } from "./deleteAccount.service.js";

type UnverifiedLocalUser = {
  id: string;
  createdAt: Date;
  email: string;
  authProvider: "LOCAL" | "GOOGLE" | "GITHUB";
  isVerified: boolean;
  profilePictureKey?: string | null;
};

export const UNVERIFIED_ACCOUNT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const isExpiredUnverifiedLocalUser = (
  user: Pick<UnverifiedLocalUser, "createdAt" | "authProvider" | "isVerified">,
  now = Date.now(),
) =>
  user.authProvider === "LOCAL" &&
  !user.isVerified &&
  now - user.createdAt.getTime() >= UNVERIFIED_ACCOUNT_TTL_MS;

const cleanupExpiredUnverifiedUserById = async (userId: string) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      authProvider: true,
      isVerified: true,
      profilePictureKey: true,
    },
  });

  if (!foundUser) return false;

  if (!isExpiredUnverifiedLocalUser(foundUser)) return false;

  await purgeAccountData({
    userId: foundUser.id,
    profilePictureKey: foundUser.profilePictureKey,
  });

  await getRedisCacheClient().del(`auth:user:${foundUser.id}`);
  await publishSocketDisconnect(foundUser.id);

  await prisma.user.deleteMany({
    where: { id: foundUser.id },
  });

  return true;
};

const cleanupAllExpiredUnverifiedUsers = async () => {
  const cutoffAt = new Date(Date.now() - UNVERIFIED_ACCOUNT_TTL_MS);

  const expiredUsers = await prisma.user.findMany({
    where: {
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: { lte: cutoffAt },
    },
    select: { id: true },
  });

  let cleanedCount = 0;

  for (const user of expiredUsers) {
    const cleaned = await cleanupExpiredUnverifiedUserById(user.id);
    if (cleaned) cleanedCount += 1;
  }

  return cleanedCount;
};

export {
  isExpiredUnverifiedLocalUser,
  cleanupExpiredUnverifiedUserById,
  cleanupAllExpiredUnverifiedUsers,
};
