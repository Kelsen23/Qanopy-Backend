import {
  S3Client,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import type { MetadataDirective } from "@aws-sdk/client-s3";

import HttpError from "../../utils/httpError.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import prisma from "../../config/prisma.config.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

import dotenv from "dotenv";
dotenv.config();

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

const updateProfilePicture = async (userId: string, objectKey: string) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("User not found", 404);

  if (!/^temp\/.*\.(png|jpg|jpeg|webp)$/i.test(objectKey)) {
    throw new HttpError("Invalid object key", 400);
  }

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
    ContentType: "image/png",
    MetadataDirective: "REPLACE" as MetadataDirective,
    CacheControl: "public, max-age=31536000",
  };

  const deleteParams = {
    Bucket: bucketName,
    Key: objectKey,
  };

  const copyCommand = new CopyObjectCommand(copyParams);
  const deleteCommand = new DeleteObjectCommand(deleteParams);

  try {
    await s3.send(copyCommand);
  } catch (error) {
    throw new HttpError(`Failed to move image: ${error}`, 500);
  }

  try {
    await s3.send(deleteCommand);
  } catch (error) {
    console.log(`Warning: temp image not deleted: ${error}`);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { profilePictureKey: newObjectKey },
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

  const profilePictureUrl = `${cloudfrontDomain}/${newObjectKey}`;
  return {
    message: "Successfully updated profile picture",
    profilePictureUrl,
  };
};

export default updateProfilePicture;
