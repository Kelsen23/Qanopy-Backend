import prisma from "../../config/prisma.config.js";

import Notification from "../../models/notification.model.js";
import UserInterest from "../../models/userInterest.model.js";

import deleteSingleImageService from "../media/deleteSingleImage.service.js";

import buildDeletedUserData from "../../utils/auth/buildDeletedUserData.util.js";
import {
  clearNotificationCache,
  clearUserBadgesCache,
} from "../../utils/cache/clearCache.util.js";
import clearModerationCachesForUser from "../../utils/cache/clearModerationCachesForUser.util.js";
import clearUserCache from "../../utils/cache/clearUserCache.util.js";

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
    prisma.moderationStrike.deleteMany({ where: { userId } }),
    prisma.warning.deleteMany({ where: { userId } }),
    prisma.ban.deleteMany({ where: { userId } }),
    prisma.moderationStats.deleteMany({ where: { userId } }),
    prisma.notificationSettings.deleteMany({ where: { userId } }),
    prisma.userBadge.deleteMany({ where: { userId } }),
  ]);

  await Notification.deleteMany({
    recipientId: userId,
  });

  await UserInterest.deleteMany({ userId });

  await clearUserCache(userId);
  await clearModerationCachesForUser(userId);
  await clearNotificationCache(userId);
  await clearUserBadgesCache(userId);
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

  await clearUserCache(updatedUser.id);
  await clearModerationCachesForUser(updatedUser.id);

  return updatedUser;
};

const processAccountDeletion = async (jobData: DeleteAccountJobData) => {
  const { userId } = jobData;

  await purgeAccountData(jobData);
  await softDeleteAccount(userId);
};

export default processAccountDeletion;
export { purgeAccountData, softDeleteAccount };
