import HttpError from "../../utils/httpError.util.js";
import { makeJobId } from "../../utils/makeJobId.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

import imageModerationQueue from "../../queues/imageModeration.queue.js";

interface RequestProfilePictureUpdateInput {
  userId: string;
  objectKey: string;
}

const requestProfilePictureUpdate = async ({
  userId,
  objectKey,
}: RequestProfilePictureUpdateInput) => {
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

  return { message: "Profile picture update queued for moderation" };
};

export default requestProfilePictureUpdate;
