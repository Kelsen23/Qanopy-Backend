import { Response, Request } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectRequest,
  PutObjectCommand,
  PutObjectRequest,
} from "@aws-sdk/client-s3";

import HttpError from "../utils/httpError.util.js";
import makeCircle from "../utils/makeCircle.util.js";

import prisma from "../config/prisma.config.js";
import { getRedisCacheClient } from "../config/redis.config.js";

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

const changeProfilePicture = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const foundUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!foundUser) throw new HttpError("User not found", 404);

    if (!req.file) throw new HttpError("No file uploaded", 400);

    if (!/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(req.file.mimetype)) {
      return res.status(400).json({ message: "Only image files are allowed!" });
    }

    if (foundUser.profilePictureKey) {
      const deleteParams: DeleteObjectRequest = {
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

    const buffer: Buffer = await makeCircle(req.file.buffer);

    const objectKey = `profilePictures/${randomImageName}.png`;

    const putParams: PutObjectRequest = {
      Bucket: bucketName,
      Key: objectKey,
      Body: buffer as any,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000",
    };

    const putCommand = new PutObjectCommand(putParams);

    try {
      await s3.send(putCommand);

      const imageUrl = `${cloudfrontDomain}/${objectKey}`;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { profilePictureUrl: imageUrl, profilePictureKey: objectKey },
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
        profilePictureUrl: updatedUser.profilePictureUrl,
      });
    } catch (error) {
      throw new HttpError(`Failed to upload image: ${error}`, 500);
    }
  },
);

export { changeProfilePicture };
