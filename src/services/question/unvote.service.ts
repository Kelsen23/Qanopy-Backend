import HttpError from "../../utils/httpError.util.js";

import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import Vote from "../../models/vote.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import invalidateCacheOnUnvote from "../../utils/invalidateCacheOnUnvote.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";

import statsQueue from "../../queues/stats.queue.js";

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
    throw new HttpError(`${normalizedTargetType} not found`, 404);
  }

  if (foundContent.isDeleted || !foundContent.isActive) {
    throw new HttpError(`${normalizedTargetType} not active`, 410);
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
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeUniqueJobId(
        "stats",
        "unvote",
        normalizedTargetType,
        targetId,
        normalizedVoteType,
        userId,
      ),
    },
  );

  await invalidateCacheOnUnvote(normalizedTargetType, targetId);

  return { message: "Successfully unvoted" };
};

export default unvote;
