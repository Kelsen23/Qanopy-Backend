import HttpError from "../../utils/httpError.util.js";
import { makeJobId } from "../../utils/makeJobId.util.js";

import imageModerationQueue from "../../queues/imageModeration.queue.js";

interface RequestContentImageModerationInput {
  userId: string;
  objectKey: string;
}

const requestContentImageModeration = async ({
  userId,
  objectKey,
}: RequestContentImageModerationInput) => {
  if (!objectKey.includes(userId)) {
    throw new HttpError("Unauthorized", 403);
  }

  await imageModerationQueue.add(
    "CONTENT",
    {
      userId,
      objectKey,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("imageModeration", "CONTENT", userId, objectKey),
    },
  );

  return {
    message: "Image uploaded and queued for moderation",
  };
};

export default requestContentImageModeration;
