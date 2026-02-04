import { Request, Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import HttpError from "../utils/httpError.util.js";
import interests from "../utils/interests.util.js";

import { getRedisCacheClient } from "../config/redis.config.js";

import prisma from "../config/prisma.config.js";

import imageModerationQueue from "../queues/imageModeration.queue.js";

const updateProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    if (
      !/^temp\/profilePictures\/[a-zA-Z0-9/_.-]+\.(png|jpg|jpeg)$/i.test(
        objectKey,
      )
    ) {
      throw new HttpError("Invalid object key", 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { profilePictureKey: objectKey },
    });

    await imageModerationQueue.add("moderateProfilePicture", {
      userId,
      type: "profilePicture",
      objectKey,
    });

    return res
      .status(202)
      .json({ message: "Profile picture update queued for moderation" });
  },
);

const updateProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { username, bio } = req.body;

    const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
    const foundUser = cachedUser
      ? JSON.parse(cachedUser)
      : await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("User not found", 404);

    if (username === foundUser.username) {
      if (bio === foundUser.bio)
        throw new HttpError("Username and bio already used", 400);
    } else {
      const usernameExists = await prisma.user.findUnique({
        where: { username },
      });

      if (usernameExists) throw new HttpError("Username is already taken", 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { username, bio },
    });
    const {
      password,
      otp,
      otpResendAvailableAt,
      otpExpireAt,
      resetPasswordOtp,
      resetPasswordOtpVerified,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpExpireAt,
      ...userWithoutSensitiveInfo
    } = updatedUser;

    await getRedisCacheClient().set(
      `user:${updatedUser.id}`,
      JSON.stringify(userWithoutSensitiveInfo),
      "EX",
      60 * 20,
    );

    return res.status(200).json({
      message: "Successfully updated profile",
      user: userWithoutSensitiveInfo,
    });
  },
);

const getInterests = asyncHandler(async (req: Request, res: Response) => {
  return res.status(200).json({ interests });
});

const saveInterests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { interests } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { interests },
    });

    const {
      password,
      otp,
      otpResendAvailableAt,
      otpExpireAt,
      resetPasswordOtp,
      resetPasswordOtpVerified,
      resetPasswordOtpResendAvailableAt,
      resetPasswordOtpExpireAt,
      ...userWithoutSensitiveInfo
    } = updatedUser;

    await getRedisCacheClient().set(
      `user:${updatedUser.id}`,
      JSON.stringify(userWithoutSensitiveInfo),
      "EX",
      60 * 20,
    );

    return res.status(200).json({
      message: "Successfully saved interests",
      interests: updatedUser.interests,
    });
  },
);

export { updateProfilePicture, updateProfile, getInterests, saveInterests };
