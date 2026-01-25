import { DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import getS3, { bucketName, cloudfrontDomain } from "../../config/s3.config.js";
import type { MetadataDirective } from "@aws-sdk/client-s3";

import HttpError from "../../utils/httpError.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import prisma from "../../config/prisma.config.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

const updateProfilePicture = async (userId: string, objectKey: string) => {
  if (/^temp\/[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)$/i.test(objectKey)) {
    throw new HttpError("Invalid object key", 400);
  }

  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("User not found", 404);

  await moderateFileService(userId, objectKey);

  if (foundUser.profilePictureKey) {
    const deleteParams = {
      Bucket: bucketName,
      Key: foundUser.profilePictureKey,
    };

    const deleteCommand = new DeleteObjectCommand(deleteParams);

    try {
      await getS3().send(deleteCommand);
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
    await getS3().send(copyCommand);
  } catch (error) {
    throw new HttpError(`Failed to move image: ${error}`, 500);
  }

  try {
    await getS3().send(deleteCommand);
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
