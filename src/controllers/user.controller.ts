import { Request, Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import HttpError from "../utils/httpError.util.js";
import buildDeletedUserData from "../utils/buildDeletedUserData.util.js";
import sanitizeUser from "../utils/sanitizeUser.util.js";
import publishSocketDisconnect from "../utils/publishSocketDisconnect.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import { clearNotificationCache } from "../utils/clearCache.util.js";

import { getRedisCacheClient } from "../config/redis.config.js";

import mongoose from "mongoose";

import Notification from "../models/notification.model.js";

import prisma from "../config/prisma.config.js";

import imageModerationQueue from "../queues/imageModeration.queue.js";
import imageDeletionQueue from "../queues/imageDeletion.queue.js";
import accountDeletionQueue from "../queues/accountDeletion.queue.js";

const updateProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    if (
      !new RegExp(
        `^temp\\/profilePictures\\/${userId}\\/[a-zA-Z0-9_.-]+\\.(png|jpg|jpeg)$`,
        "i",
      ).test(objectKey)
    ) {
      throw new HttpError("Invalid object key", 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { profilePictureKey: objectKey },
    });

    await getRedisCacheClient().del(`user:${userId}`);

    await imageModerationQueue.add(
      "PROFILE_PICTURE",
      {
        userId,
        objectKey,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "imageModeration",
          "PROFILE_PICTURE",
          userId,
          objectKey,
        ),
      },
    );

    return res
      .status(202)
      .json({ message: "Profile picture update queued for moderation" });
  },
);

const deleteProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const cachedUser = await getRedisCacheClient().get(
      `user:${userId}`,
    );
    const foundUser = cachedUser
      ? JSON.parse(cachedUser)
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { profilePictureKey: true, profilePictureUrl: true },
        });

    if (foundUser.profilePictureKey) {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { profilePictureKey: null },
      });

      await getRedisCacheClient().del(`user:${userId}`);

      if (updatedUser.profilePictureKey)
        await imageDeletionQueue.add(
          "DELETE_SINGLE",
          {
            objectKey: updatedUser.profilePictureKey,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "imageDeletion",
              "DELETE_SINGLE",
              updatedUser.profilePictureKey,
            ),
          },
        );

      return res.status(202).json({
        message: "Successfully deleted profile picture",
        profulePictureKey: updatedUser.profilePictureKey,
        profilePictureUrl: updatedUser.profilePictureUrl,
      });
    } else if (foundUser.profilePictureUrl) {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { profilePictureUrl: null },
      });

      await getRedisCacheClient().del(`user:${userId}`);

      return res.status(202).json({
        message: "Successfully deleted profile picture",
        profulePictureKey: updatedUser.profilePictureKey,
        profilePictureUrl: updatedUser.profilePictureUrl,
      });
    } else throw new HttpError("Profile picture already deleted", 400);
  },
);

const updateProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { displayName, bio } = req.body;

    const cachedUser = await getRedisCacheClient().get(
      `user:${userId}`,
    );
    const foundUser = cachedUser
      ? JSON.parse(cachedUser)
      : await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("User not found", 404);

    const data: { displayName?: string | null; bio?: string } = {};

    if (displayName !== undefined && displayName !== foundUser.displayName)
      data.displayName = displayName;

    if (bio !== undefined && bio !== foundUser.bio) data.bio = bio;

    if (Object.keys(data).length === 0)
      throw new HttpError("Profile already up to date", 400);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
    });

    await getRedisCacheClient().set(
      `user:${updatedUser.id}`,
      JSON.stringify(sanitizeUser(updatedUser)),
      "EX",
      60 * 20,
    );

    return res.status(200).json({
      message: "Successfully updated profile",
      user: sanitizeUser(updatedUser),
    });
  },
);

const deleteAccount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

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

    if (foundUser.isDeleted && foundUser.accountDeletionCompletedAt)
      throw new HttpError("User already deleted", 409);

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

    return res.status(202).json({
      message: "Account deletion queued",
    });
  },
);

const getNotificationSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const settings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return res.status(200).json({
      message: "Successfully received notification settings",
      settings,
    });
  },
);

const updateNotificationSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const updatedSettings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: {
        ...req.body,
      },
      create: {
        userId,
        ...req.body,
      },
    });

    return res.status(200).json({
      message: "Notification settings updated successfully",
      settings: updatedSettings,
    });
  },
);

const markNotificationsAsSeen = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const userId = req.user.id;
  const { notificationIds } = req.body;

  const validIds = notificationIds.filter((id: string) =>
    mongoose.isValidObjectId(id),
  );

  if (validIds.length === 0)
    return res.status(200).json({ message: "No valid notification ids" });

  await Notification.updateMany(
    {
      recipientId: userId,
      _id: { $in: validIds },
      seen: false,
    },
    { $set: { seen: true } },
  );

  await clearNotificationCache(userId);

  return res.status(200).json({
    message: "Notifications marked as seen",
  });
};

export {
  updateProfilePicture,
  deleteProfilePicture,
  updateProfile,
  deleteAccount,
  getNotificationSettings,
  updateNotificationSettings,
  markNotificationsAsSeen,
};
