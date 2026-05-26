import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import getS3, { bucketName, cloudfrontDomain } from "../../config/s3.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import moveS3Object from "../../utils/moveS3Object.util.js";
import { cacheUser } from "../auth/auth.shared.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

import crypto from "crypto";

const updateProfilePicture = async (userId: string, objectKey: string) => {
  const foundUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new Error("User not found");

  await moderateFileService(userId, objectKey);

  const randomImageName = crypto.randomUUID();

  const newObjectKey = `profilePictures/${randomImageName}.png`;

  const moved = await moveS3Object(objectKey, newObjectKey);

  if (!moved) {
    return {
      message: "Profile picture update skipped",
      profilePictureUrl: null,
    };
  }

  const updatedUser = await prisma.user.updateMany({
    where: {
      id: userId,
      profilePictureKey: objectKey,
    },
    data: { profilePictureKey: newObjectKey },
  });

  if (updatedUser.count === 0) {
    console.warn(
      `Skipped profile picture finalize for user ${userId}: temp key ${objectKey} no longer matched user state`,
    );

    await getS3().send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: newObjectKey,
      }),
    );

    return {
      message: "Profile picture update skipped",
      profilePictureUrl: null,
    };
  }

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (refreshedUser) {
    await cacheUser(refreshedUser);
    await getRedisCacheClient().del(`auth:user:${userId}`);
  }

  const profilePictureUrl = `${cloudfrontDomain}/${newObjectKey}`;
  return {
    message: "Successfully updated profile picture",
    profilePictureUrl,
  };
};

export default updateProfilePicture;
