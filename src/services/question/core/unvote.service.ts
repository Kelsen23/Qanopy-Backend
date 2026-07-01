import mongoose from "mongoose";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { getContentTypeLabel } from "../../../utils/content/contentTypeLabel.util.js";
import HttpError from "../../../utils/http/httpError.util.js";
import invalidateCacheOnUnvote from "../../../utils/cache/invalidateCacheOnUnvote.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";
import Reply from "../../../models/reply.model.js";
import Vote from "../../../models/vote.model.js";

import statsQueue from "../../../queues/stats.queue.js";

type TargetType = "QUESTION" | "ANSWER" | "REPLY";

const modelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
} as const;

const actionMap = {
  QUESTION: {
    UPVOTE: "UNVOTE_UPVOTE_QUESTION",
    DOWNVOTE: "UNVOTE_DOWNVOTE_QUESTION",
  },
  ANSWER: {
    UPVOTE: "UNVOTE_UPVOTE_ANSWER",
    DOWNVOTE: "UNVOTE_DOWNVOTE_ANSWER",
  },
  REPLY: {
    UPVOTE: "UNVOTE_UPVOTE_REPLY",
    DOWNVOTE: "UNVOTE_DOWNVOTE_REPLY",
  },
} as const;

const unvote = async (userId: string, targetType: string, targetId: string) => {
  if (
    targetType !== "question" &&
    targetType !== "answer" &&
    targetType !== "reply"
  )
    throw new HttpError("Invalid target type", 400);

  const normalizedTargetType = targetType.toUpperCase() as TargetType;

  if (
    typeof targetId !== "string" ||
    !mongoose.Types.ObjectId.isValid(targetId)
  ) {
    throw new HttpError("Invalid targetId", 400);
  }

  const foundVote = await Vote.findOne({
    userId,
    targetType: normalizedTargetType,
    targetId,
  });

  if (!foundVote) throw new HttpError("Vote not found", 404);

  const Model = modelMap[normalizedTargetType];
  let foundContent: any;

  if (normalizedTargetType === "QUESTION") {
    const cachedQuestion = await getRedisCacheClient().get(
      `question:${targetId}`,
    );
    foundContent = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Model.findById(targetId).lean();
  } else {
    foundContent = await Model.findById(targetId).lean();
  }

  if (!foundContent) {
    throw new HttpError(
      `${getContentTypeLabel(normalizedTargetType)} not found`,
      404,
    );
  }

  if (foundContent.isDeleted || !foundContent.isActive) {
    throw new HttpError(
      `${getContentTypeLabel(normalizedTargetType)} not active`,
      410,
    );
  }

  const normalizedVoteType = String(foundVote.voteType).toUpperCase() as
    | "UPVOTE"
    | "DOWNVOTE";

  const updateField =
    normalizedVoteType === "UPVOTE"
      ? { $inc: { upvoteCount: -1 } }
      : { $inc: { downvoteCount: -1 } };

  const session = await mongoose.startSession();

  await session.withTransaction(async () => {
    await Vote.deleteOne(
      { userId, targetType: normalizedTargetType, targetId },
      { session },
    );

    await Model.findByIdAndUpdate(
      foundContent._id || foundContent.id,
      updateField,
      { session },
    );
  });

  session.endSession();

  await statsQueue.add(
    "UNVOTE",
    {
      userId: foundContent.userId as string,
      action: actionMap[normalizedTargetType][normalizedVoteType],
      eventId: makeJobId(
        "vote",
        "unvote",
        normalizedTargetType,
        foundVote._id,
        foundVote.updatedAt ?? foundVote.createdAt ?? "",
      ),
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "stats",
        "unvote",
        normalizedTargetType,
        foundVote._id,
        foundVote.updatedAt ?? foundVote.createdAt ?? "",
        normalizedVoteType,
        userId,
      ),
    },
  );

  await invalidateCacheOnUnvote(normalizedTargetType, targetId);

  return { message: "Successfully unvoted" };
};

export default unvote;
