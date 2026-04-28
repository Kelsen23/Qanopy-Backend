import HttpError from "../../utils/httpError.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import {
  clearAnswerCache,
  clearReplyCache,
} from "../../utils/clearCache.util.js";
import { makeUniqueJobId } from "../../utils/makeJobId.util.js";
import queueUserInterest from "../../utils/queueUserInterest.util.js";

import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import Vote from "../../models/vote.model.js";

import statsQueue from "../../queues/stats.queue.js";

import routeNotification from "../notification/routeNotification.service.js";

type TargetType = "QUESTION" | "ANSWER" | "REPLY";
type VoteType = "UPVOTE" | "DOWNVOTE";

const bestEffortRouteNotification = async (
  params: Parameters<typeof routeNotification>[0],
  context: Record<string, unknown>,
) => {
  try {
    await routeNotification(params);
  } catch (error) {
    console.error("[vote] Failed to enqueue notification", {
      ...context,
      error,
    });
  }
};

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
  const existingVoteType = existingVote
    ? String(existingVote.voteType).toUpperCase()
    : null;

  if (existingVote && existingVoteType === voteType) {
    return {
      message: `This ${targetType.toLowerCase()} is already ${voteType.toLowerCase()}d`,
      vote: existingVote,
    };
  }

  if (targetType === "QUESTION") {
    const cachedQuestion = await getRedisCacheClient().get(
      `question:${targetId}`,
    );
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
              voteType === "UPVOTE"
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
              voteType === "UPVOTE" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundQuestion.userId as string,
        action: existingVote
          ? voteType === "UPVOTE"
            ? "CHANGE_DOWNVOTE_TO_UPVOTE_QUESTION"
            : "CHANGE_UPVOTE_TO_DOWNVOTE_QUESTION"
          : voteType === "UPVOTE"
            ? "RECEIVE_UPVOTE_QUESTION"
            : "RECEIVE_DOWNVOTE_QUESTION",
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "stats",
          "changeReputationPoints",
          "QUESTION",
          targetId,
          voteType,
          userId,
        ),
      },
    );

    if (voteType === "UPVOTE" && foundQuestion.tags?.length) {
      await queueUserInterest({
        userId,
        tags: foundQuestion.tags as string[],
        action: "UPVOTE",
      });
    }

    await getRedisCacheClient().del(`question:${targetId}`);

    if (foundQuestion.userId !== userId) {
      await bestEffortRouteNotification(
        {
          recipientId: foundQuestion.userId as string,
          actorId: userId,
          event: voteType,
          target: {
            entityType: "QUESTION",
            entityId: targetId,
          },
          meta: {},
        },
        {
          recipientId: foundQuestion.userId,
          actorId: userId,
          event: voteType,
          targetType,
          targetId,
        },
      );
    }

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  if (targetType === "ANSWER") {
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
              voteType === "UPVOTE"
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
              voteType === "UPVOTE" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundAnswer.userId as string,
        action: existingVote
          ? voteType === "UPVOTE"
            ? "CHANGE_DOWNVOTE_TO_UPVOTE_ANSWER"
            : "CHANGE_UPVOTE_TO_DOWNVOTE_ANSWER"
          : voteType === "UPVOTE"
            ? "RECEIVE_UPVOTE_ANSWER"
            : "RECEIVE_DOWNVOTE_ANSWER",
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "stats",
          "changeReputationPoints",
          "ANSWER",
          targetId,
          voteType,
          userId,
        ),
      },
    );

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    if (foundAnswer.userId !== userId) {
      await bestEffortRouteNotification(
        {
          recipientId: foundAnswer.userId as string,
          actorId: userId,
          event: voteType,
          target: {
            entityType: "ANSWER",
            entityId: targetId,
            parentId: foundAnswer.questionId as string,
          },
          meta: {},
        },
        {
          recipientId: foundAnswer.userId,
          actorId: userId,
          event: voteType,
          targetType,
          targetId,
          parentId: foundAnswer.questionId,
        },
      );
    }

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  if (targetType === "REPLY") {
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
              voteType === "UPVOTE"
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
              voteType === "UPVOTE" ? { upvoteCount: 1 } : { downvoteCount: 1 },
          },
          { session },
        );
      }
    });

    session.endSession();

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundReply.userId as string,
        action: existingVote
          ? voteType === "UPVOTE"
            ? "CHANGE_DOWNVOTE_TO_UPVOTE_REPLY"
            : "CHANGE_UPVOTE_TO_DOWNVOTE_REPLY"
          : voteType === "UPVOTE"
            ? "RECEIVE_UPVOTE_REPLY"
            : "RECEIVE_DOWNVOTE_REPLY",
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeUniqueJobId(
          "stats",
          "changeReputationPoints",
          "REPLY",
          targetId,
          voteType,
          userId,
        ),
      },
    );

    await clearReplyCache(foundReply.answerId as string);

    if (foundReply.userId !== userId) {
      await bestEffortRouteNotification(
        {
          recipientId: foundReply.userId as string,
          actorId: userId,
          event: voteType,
          target: {
            entityType: "REPLY",
            entityId: targetId,
            parentId: foundReply.answerId as string,
          },
          meta: {},
        },
        {
          recipientId: foundReply.userId,
          actorId: userId,
          event: voteType,
          targetType,
          targetId,
          parentId: foundReply.answerId,
        },
      );
    }

    return {
      message: "Vote processed",
      vote: resultVote,
    };
  }

  throw new HttpError("Invalid vote target", 400);
};

export default vote;
