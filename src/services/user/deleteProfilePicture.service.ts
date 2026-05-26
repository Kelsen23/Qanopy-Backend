import HttpError from "../../utils/httpError.util.js";
import { makeJobId } from "../../utils/makeJobId.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import imageDeletionQueue from "../../queues/imageDeletion.queue.js";

type CachedUser = {
  profilePictureKey?: string | null;
  profilePictureUrl?: string | null;
};

const deleteProfilePicture = async (userId: string) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser: CachedUser | null = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({
        where: { id: userId },
        select: { profilePictureKey: true, profilePictureUrl: true },
      });

  if (!foundUser) throw new HttpError("User not found", 404);

  if (foundUser.profilePictureKey) {
    const profilePictureKey = foundUser.profilePictureKey;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { profilePictureKey: null, profilePictureUrl: null },
    });

    await getRedisCacheClient().del(`user:${userId}`);

    await imageDeletionQueue.add(
      "DELETE_SINGLE",
      {
        objectKey: profilePictureKey,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("imageDeletion", "DELETE_SINGLE", profilePictureKey),
      },
    );

    return {
      profilePictureKey: updatedUser.profilePictureKey,
      profilePictureUrl: updatedUser.profilePictureUrl,
    };
  }

  if (foundUser.profilePictureUrl) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { profilePictureKey: null, profilePictureUrl: null },
    });

    await getRedisCacheClient().del(`user:${userId}`);

    return {
      profilePictureKey: updatedUser.profilePictureKey,
      profilePictureUrl: updatedUser.profilePictureUrl,
    };
  }

  throw new HttpError("Profile picture already deleted", 400);
};

export default deleteProfilePicture;
