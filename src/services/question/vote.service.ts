import HttpError from "../../utils/httpError.util.js";

import { redisCacheClient } from "../../config/redis.config.js";
import {
  clearAnswerCache,
  clearReplyCache,
} from "../../utils/clearCache.util.js";

import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import Vote from "../../models/vote.model.js";

import statsQueue from "../../queues/stats.queue.js";

type TargetType = "Question" | "Answer" | "Reply";
type VoteType = "upvote" | "downvote";

const vote = async (
  userId: string,
  {
    targetType,
    targetId,
    voteType,
  }: {
    targetType: TargetType;
    targetId: string;
    voteType: VoteType;
  },
) => {
  const existingVote = await Vote.findOne({
    userId,
    targetType,
    targetId,
  });

  if (existingVote && existingVote.voteType === voteType) {
    return {
      message: `This ${targetType.toLowerCase()} is already ${voteType}d`,
      vote: existingVote,
    };
  }

  if (targetType === "Question") {
    const cachedQuestion = await redisCacheClient.get(`question:${targetId}`);
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(targetId);

    if (!foundQuestion) throw new HttpError("Question not found", 404);
    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const session = await mongoose.startSession();
    let resultVote;

    await session.withTransaction(async () => {
      if (existingVote) {
        resultVote = await Vote.findByIdAndUpdate(
          existingVote._id,
          { voteType },
          { new: true, session },
        );

        await Question.findByIdAndUpdate(
          foundQuestion._id || foundQuestion.id,
          {
            $inc:
              voteType === "upvote"
                ? { upvoteCount: 1, downvoteCount: -1 }
                : { upvoteCount: -1, downvoteCount: 1 },
          },
          { session },
        );
      } else {
        const [createdVote] = await Vote.create(
          [{ userId, targetType, targetId, voteType }],
          { session },
        );
        resultVote = createdVote;

        await Question.findByIdAndUpdate(
          foundQuestion._id || foundQuestion.id,
          {
            $inc:
              voteType === "upvote" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add("changeReputationPoints", {
      userId: foundQuestion.userId as string,
      action: existingVote
        ? voteType === "upvote"
          ? "CHANGE_DOWNVOTE_TO_UPVOTE"
          : "CHANGE_UPVOTE_TO_DOWNVOTE"
        : voteType === "upvote"
          ? "RECEIVE_UPVOTE_QUESTION"
          : "RECEIVE_DOWNVOTE_QUESTION",
    });

    await redisCacheClient.del(`question:${targetId}`);

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  if (targetType === "Answer") {
    const foundAnswer = await Answer.findById(targetId);
    if (!foundAnswer) throw new HttpError("Answer not found", 404);
    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    const session = await mongoose.startSession();
    let resultVote;

    await session.withTransaction(async () => {
      if (existingVote) {
        resultVote = await Vote.findByIdAndUpdate(
          existingVote._id,
          { voteType },
          { new: true, session },
        );

        await Answer.findByIdAndUpdate(
          foundAnswer._id,
          {
            $inc:
              voteType === "upvote"
                ? { upvoteCount: 1, downvoteCount: -1 }
                : { upvoteCount: -1, downvoteCount: 1 },
          },
          { session },
        );
      } else {
        const [createdVote] = await Vote.create(
          [{ userId, targetType, targetId, voteType }],
          { session },
        );
        resultVote = createdVote;

        await Answer.findByIdAndUpdate(
          foundAnswer._id,
          {
            $inc:
              voteType === "upvote" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add("changeReputationPoints", {
      userId: foundAnswer.userId as string,
      action: existingVote
        ? voteType === "upvote"
          ? "CHANGE_DOWNVOTE_TO_UPVOTE"
          : "CHANGE_UPVOTE_TO_DOWNVOTE"
        : voteType === "upvote"
          ? "RECEIVE_UPVOTE_ANSWER"
          : "RECEIVE_DOWNVOTE_ANSWER",
    });

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  if (targetType === "Reply") {
    const foundReply = await Reply.findById(targetId);
    if (!foundReply) throw new HttpError("Reply not found", 404);
    if (foundReply.isDeleted || !foundReply.isActive)
      throw new HttpError("Reply not active", 410);

    const session = await mongoose.startSession();
    let resultVote;

    await session.withTransaction(async () => {
      if (existingVote) {
        resultVote = await Vote.findByIdAndUpdate(
          existingVote._id,
          { voteType },
          { new: true, session },
        );

        await Reply.findByIdAndUpdate(
          foundReply._id,
          {
            $inc:
              voteType === "upvote"
                ? { upvoteCount: 1, downvoteCount: -1 }
                : { upvoteCount: -1, downvoteCount: 1 },
          },
          { session },
        );
      } else {
        const [createdVote] = await Vote.create(
          [{ userId, targetType, targetId, voteType }],
          { session },
        );
        resultVote = createdVote;

        await Reply.findByIdAndUpdate(
          foundReply._id,
          {
            $inc:
              voteType === "upvote" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add("changeReputationPoints", {
      userId: foundReply.userId as string,
      action: existingVote
        ? voteType === "upvote"
          ? "CHANGE_DOWNVOTE_TO_UPVOTE"
          : "CHANGE_UPVOTE_TO_DOWNVOTE"
        : voteType === "upvote"
          ? "RECEIVE_UPVOTE_REPLY"
          : "RECEIVE_DOWNVOTE_REPLY",
    });

    await clearReplyCache(foundReply.answerId as string);

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  throw new HttpError("Invalid vote target", 400);
};

export default vote;
