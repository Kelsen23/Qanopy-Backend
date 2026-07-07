import { HeadObjectCommand } from "@aws-sdk/client-s3";

import { getRedisCacheClient } from "../../config/redis.config.js";
import getS3, { bucketName } from "../../config/s3.config.js";
import prisma from "../../config/prisma.config.js";

import HttpError from "../../utils/http/httpError.util.js";
import { makeJobId } from "../../utils/job/makeJobId.util.js";

import imageModerationQueue from "../../queues/imageModeration.queue.js";

interface RequestProfilePictureUpdateInput {
  userId: string;
  objectKey: string;
}

type UploadFingerprint = {
  eTag: string | null;
  contentLength: number | null;
};

const requestProfilePictureUpdate = async ({
  userId,
  objectKey,
}: RequestProfilePictureUpdateInput) => {
  if (
    !new RegExp(
      `^profilePictures\\/temp\\/${userId}\\/[a-zA-Z0-9_.-]+\\.(png|jpg|jpeg)$`,
      "i",
    ).test(objectKey)
  ) {
    throw new HttpError("Invalid object key", 400);
  }

  let uploadFingerprint: UploadFingerprint;

  try {
    const headResult = await getS3().send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      }),
    );

    uploadFingerprint = {
      eTag: headResult.ETag ?? null,
      contentLength: headResult.ContentLength ?? null,
    };
  } catch {
    throw new HttpError("Uploaded image could not be verified", 400);
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
      uploadFingerprint,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "imageModeration",
        "PROFILE_PICTURE",
        userId,
        objectKey,
        uploadFingerprint.eTag ?? "no-etag",
        uploadFingerprint.contentLength ?? "no-size",
      ),
    },
  );

  return { message: "Profile picture update submitted" };
};

export default requestProfilePictureUpdate;
