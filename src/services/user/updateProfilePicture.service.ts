import crypto from "crypto";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

import { getRedisCacheClient } from "../../config/redis.config.js";
import getS3, { bucketName, cloudfrontDomain } from "../../config/s3.config.js";
import prisma from "../../config/prisma.config.js";

import moderateFileService from "../../services/moderation/fileModeration.service.js";

import moveS3Object from "../../utils/moveS3Object.util.js";
import { cacheUser } from "../auth/auth.shared.js";

type UploadFingerprint = {
  eTag: string | null;
  contentLength: number | null;
};

const updateProfilePicture = async (
  userId: string,
  objectKey: string,
  uploadFingerprint?: UploadFingerprint,
) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, profilePictureKey: true },
  });

  if (!foundUser) throw new Error("User not found");

  await moderateFileService(userId, objectKey, "PROFILE_PICTURE");

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePictureKey: true },
  });

  if (
    !currentUser ||
    !currentUser.profilePictureKey ||
    currentUser.profilePictureKey !== objectKey
  ) {
    console.warn(
      `Skipped profile picture finalize for user ${userId}: temp key ${objectKey} no longer matched user state`,
    );

    return {
      message: "Profile picture update skipped",
      profilePictureUrl: null,
    };
  }

  if (uploadFingerprint) {
    let currentObject: {
      ETag?: string;
      ContentLength?: number;
    };

    try {
      currentObject = await getS3().send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        }),
      );
    } catch {
      console.warn(
        `Skipped profile picture finalize for user ${userId}: temp key ${objectKey} could not be verified`,
      );

      return {
        message: "Profile picture update skipped",
        profilePictureUrl: null,
      };
    }

    const currentFingerprint = {
      eTag: currentObject.ETag ?? null,
      contentLength: currentObject.ContentLength ?? null,
    };

    if (
      currentFingerprint.eTag !== uploadFingerprint.eTag ||
      currentFingerprint.contentLength !== uploadFingerprint.contentLength
    ) {
      console.warn(
        `Skipped profile picture finalize for user ${userId}: temp key ${objectKey} no longer matched uploaded content`,
      );

      return {
        message: "Profile picture update skipped",
        profilePictureUrl: null,
      };
    }
  }

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
