import { Request, Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import HttpError from "../utils/httpError.util.js";
import interests from "../utils/interests.util.js";

import { getRedisCacheClient } from "../config/redis.config.js";

import prisma from "../config/prisma.config.js";

import moderateFileService from "../services/moderation/fileModeration.service.js";

import {
  S3Client,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;

if (
  !bucketName ||
  !bucketRegion ||
  !accessKey ||
  !secretAccessKey ||
  !cloudfrontDomain
)
  throw new Error("Missing AWS S3 environment variables");

const s3 = new S3Client({
  region: bucketRegion,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
});

const updateProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
    const foundUser = cachedUser
      ? JSON.parse(cachedUser)
      : await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("User not found", 404);

    await moderateFileService(objectKey, s3);

    if (foundUser.profilePictureKey) {
      const deleteParams = {
        Bucket: bucketName,
        Key: foundUser.profilePictureKey,
      };

      const deleteCommand = new DeleteObjectCommand(deleteParams);

      try {
        await s3.send(deleteCommand);
      } catch (error) {
        console.log(`Couldn't delete an object: ${error}`);
      }
    }

    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let randomImageName = "";

    for (let i = 1; i <= 10; i++) {
      randomImageName += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const newObjectKey = `profilePictures/${randomImageName}.png`;

    const copyParams = {
      Bucket: bucketName,
      CopySource: `${bucketName}/${objectKey}`,
      Key: newObjectKey,
    };

    const deleteParams = {
      Bucket: bucketName,
      Key: objectKey,
    };

    const copyCommand = new CopyObjectCommand(copyParams);
    const deleteCommand = new DeleteObjectCommand(deleteParams);

    try {
      await s3.send(copyCommand);
      await s3.send(deleteCommand);

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { profilePictureKey: objectKey },
      });

      const {
        password,
        profilePictureKey,
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
        message: "Successfully changed profile picture",
        profilePictureKey: objectKey,
      });
    } catch (error) {
      throw new HttpError(`Failed to move image: ${error}`, 500);
    }
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
      profilePictureKey,
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
      profilePictureKey,
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
