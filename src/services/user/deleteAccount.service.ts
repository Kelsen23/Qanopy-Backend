import {
  clearNotificationCache,
  clearUserBadgesCache,
} from "../../utils/cache/clearCache.util.js";
import { makeJobId } from "../../utils/job/makeJobId.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import buildDeletedUserData from "../../utils/auth/buildDeletedUserData.util.js";
import publishSocketDisconnect from "../../utils/socket/publishSocketDisconnect.util.js";
import sanitizeUser from "../../utils/auth/sanitizeUser.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import accountDeletionQueue from "../../queues/accountDeletion.queue.js";

interface DeleteAccountInput {
  userId: string;
}

const deleteAccount = async ({ userId }: DeleteAccountInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tokenVersion: true,
      status: true,
      isDeleted: true,
      accountDeletionRequestedAt: true,
      accountDeletionCompletedAt: true,
      profilePictureKey: true,
      deletedAt: true,
    },
  });

  if (!foundUser) throw new HttpError("User not found", 404);

  if (foundUser.isDeleted && foundUser.accountDeletionCompletedAt) {
    throw new HttpError("User already deleted", 409);
  }

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

  const updatedUser = foundUser.isDeleted
    ? await prisma.user.update({
        where: { id: userId },
        data: {
          accountDeletionRequestedAt:
            foundUser.accountDeletionRequestedAt ?? deletedAt,
        },
      })
    : await prisma.user.update({
        where: { id: userId },
        data: {
          ...deletedUserData,
          accountDeletionRequestedAt: deletedAt,
          tokenVersion: { increment: 1 },
        },
      });

  await getRedisCacheClient().set(
    `user:${userId}`,
    JSON.stringify(sanitizeUser(updatedUser)),
    "EX",
    60 * 20,
  );
  await getRedisCacheClient().del(`auth:user:${userId}`);
  await clearNotificationCache(userId);
  await clearUserBadgesCache(userId);
  await publishSocketDisconnect(userId);

  await accountDeletionQueue.add(
    "DELETE_ACCOUNT",
    {
      userId,
      profilePictureKey: foundUser.profilePictureKey,
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
