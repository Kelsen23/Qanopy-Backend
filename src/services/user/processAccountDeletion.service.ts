import type { Prisma } from "../../generated/prisma/client.js";

import deleteSingleImageService from "../media/deleteSingleImage.service.js";

import prisma from "../../config/prisma.config.js";

import buildDeletedUserData from "../../utils/auth/buildDeletedUserData.util.js";
import {
  clearNotificationCache,
  clearUserBadgesCache,
} from "../../utils/cache/clearCache.util.js";
import clearModerationCachesForUser from "../../utils/cache/clearModerationCachesForUser.util.js";
import clearUserCache from "../../utils/cache/clearUserCache.util.js";

import Notification from "../../models/notification.model.js";
import UserInterest from "../../models/userInterest.model.js";

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
    prisma.creditPeriodUsage.deleteMany({ where: { userId } }),
    prisma.creditOperation.deleteMany({ where: { userId } }),
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
      statusState: true,
    },
  });

  if (!foundUser) return null;

  if (foundUser.statusState?.accountDeletionCompletedAt) return foundUser;

  const deletedAt = foundUser.statusState?.deletedAt ?? new Date();
  const deletedUserData = await buildDeletedUserData(
    userId,
    deletedAt,
    async (username) =>
      !(await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      })),
  );

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        username: deletedUserData.username,
        email: deletedUserData.email,
        role: deletedUserData.role,
      },
    });

    await tx.userAuth.update({
      where: { userId },
      data: {
        password: null,
        tokenVersion: { increment: 1 },
        otp: null,
        otpExpireAt: null,
        otpResendAvailableAt: null,
        resetPasswordOtp: null,
        resetPasswordOtpVerified: null,
        resetPasswordOtpExpireAt: null,
        resetPasswordOtpResendAvailableAt: null,
        isVerified: false,
        authProvider: "LOCAL",
      },
    });

    await tx.userProfile.update({
      where: { userId },
      data: {
        displayName: deletedUserData.displayName,
        bio: null,
        profilePictureKey: null,
        profilePictureUrl: null,
      },
    });

    await tx.userStats.update({
      where: { userId },
      data: {
        reputationPoints: 0,
        questionsAsked: 0,
        answersGiven: 0,
        acceptedAnswers: 0,
        bestAnswers: 0,
      },
    });

    await tx.userStatus.update({
      where: { userId },
      data: {
        status: "TERMINATED",
        isDeleted: true,
        deletedAt,
        accountDeletionCompletedAt: new Date(),
      },
    });

    await tx.userEmailChange.update({
      where: { userId },
      data: {
        pendingEmail: null,
        otp: null,
        otpExpireAt: null,
        otpResendAvailableAt: null,
      },
    });
  });

  await clearUserCache(userId);
  await clearModerationCachesForUser(userId);

  return foundUser;
};

const processAccountDeletion = async (jobData: DeleteAccountJobData) => {
  const { userId } = jobData;

  await purgeAccountData(jobData);
  await softDeleteAccount(userId);
};

export default processAccountDeletion;
export { purgeAccountData, softDeleteAccount };
