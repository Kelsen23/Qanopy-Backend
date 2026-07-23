import type { Prisma } from "../../generated/prisma/client.js";

import { flattenUser, normalizedUserInclude } from "./userData.service.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import {
  clearNotificationCache,
  clearUserBadgesCache,
} from "../../utils/cache/clearCache.util.js";
import clearModerationCachesForUser from "../../utils/cache/clearModerationCachesForUser.util.js";
import { makeJobId } from "../../utils/job/makeJobId.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import buildDeletedUserData from "../../utils/auth/buildDeletedUserData.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";
import sanitizeUser from "../../utils/auth/sanitizeUser.util.js";

import accountDeletionQueue from "../../queues/accountDeletion.queue.js";

interface DeleteAccountInput {
  userId: string;
}

const deleteAccount = async ({ userId }: DeleteAccountInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      statusState: true,
      profile: { select: { profilePictureKey: true } },
    },
  });

  if (!foundUser) throw new HttpError("User not found", 404);

  if (
    foundUser.statusState?.isDeleted &&
    foundUser.statusState.accountDeletionCompletedAt
  ) {
    throw new HttpError("User already deleted", 409);
  }

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
    if (foundUser.statusState?.isDeleted) {
      await tx.userStatus.update({
        where: { userId },
        data: {
          accountDeletionRequestedAt:
            foundUser.statusState.accountDeletionRequestedAt ?? deletedAt,
        },
      });
      return;
    }

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
        accountDeletionRequestedAt: deletedAt,
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

  const updatedUser = flattenUser(
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: normalizedUserInclude,
    }),
  );

  await getRedisCacheClient().set(
    `user:${userId}`,
    JSON.stringify(sanitizeUser(updatedUser)),
    "EX",
    60 * 20,
  );
  await getRedisCacheClient().del(`auth:user:${userId}`);
  await clearModerationCachesForUser(userId);
  await clearNotificationCache(userId);
  await clearUserBadgesCache(userId);
  await publishSocketDisconnect(userId);

  await accountDeletionQueue.add(
    "DELETE_ACCOUNT",
    {
      userId,
      profilePictureKey: foundUser.profile?.profilePictureKey,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("accountDeletion", "DELETE_ACCOUNT", userId),
    },
  );

  return { message: "Account deletion submitted" };
};

export default deleteAccount;
