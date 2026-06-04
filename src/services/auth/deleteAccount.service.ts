import prisma from "../../config/prisma.config.js";

import Notification from "../../models/notification.model.js";
import UserInterest from "../../models/userInterest.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import deleteSingleImageService from "../media/deleteSingleImage.service.js";

import buildDeletedUserData from "../../utils/buildDeletedUserData.util.js";

import { clearNotificationCache } from "../../utils/clearCache.util.js";

type DeleteAccountJobData = {
  userId: string;
  profilePictureKey?: string | null;
};

const purgeAccountData = async ({
  userId,
  profilePictureKey,
}: DeleteAccountJobData) => {
  if (profilePictureKey) {
    try {
      await deleteSingleImageService({ objectKey: profilePictureKey });
    } catch (error) {
      console.warn(
        `Could not delete profile picture for account ${userId}`,
        error,
      );
    }
  }

  await Promise.all([
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.moderationStrike.deleteMany({ where: { userId } }),
    prisma.warning.deleteMany({ where: { userId } }),
    prisma.ban.deleteMany({ where: { userId } }),
    prisma.moderationStats.deleteMany({ where: { userId } }),
    prisma.notificationSettings.deleteMany({ where: { userId } }),
  ]);

  await Notification.deleteMany({
    recipientId: userId,
  });

  await UserInterest.deleteMany({ userId });

  await getRedisCacheClient().del(`user:${userId}`);
  await clearNotificationCache(userId);
};

const softDeleteAccount = async (userId: string) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      isDeleted: true,
      deletedAt: true,
      accountDeletionCompletedAt: true,
    },
  });

  if (!foundUser) return null;

  if (foundUser.accountDeletionCompletedAt) return foundUser;

  const deletedAt = foundUser.deletedAt ?? new Date();
  const deletedUserData = await buildDeletedUserData(
    userId,
    deletedAt,
    async (username) =>
      !(await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      })),
  );

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...deletedUserData,
      accountDeletionCompletedAt: new Date(),
    },
  });

  return updatedUser;
};

const deleteAccount = async (jobData: DeleteAccountJobData) => {
  const { userId } = jobData;

  await purgeAccountData(jobData);
  await softDeleteAccount(userId);
};

export default deleteAccount;
export { purgeAccountData, softDeleteAccount };
