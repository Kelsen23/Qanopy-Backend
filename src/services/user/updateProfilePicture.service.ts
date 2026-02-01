import { cloudfrontDomain } from "../../config/s3.config.js";

import HttpError from "../../utils/httpError.util.js";

import moveS3Object from "../../utils/moveS3Object.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import prisma from "../../config/prisma.config.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

import crypto from "crypto";

const updateProfilePicture = async (userId: string, objectKey: string) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("User not found", 404);

  await moderateFileService(userId, objectKey);

  const randomImageName = crypto.randomUUID();

  const newObjectKey = `profilePictures/${randomImageName}.png`;

  await moveS3Object(objectKey, newObjectKey);

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
