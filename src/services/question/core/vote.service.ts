import mongoose from "mongoose";

import routeNotification from "../../notification/routeNotification.service.js";
import queueUserInterest from "../../user/userInterest/queueUserInterest.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import {
  clearAnswerCache,
  clearReplyCache,
} from "../../../utils/cache/clearCache.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";
import Reply from "../../../models/reply.model.js";
import Vote from "../../../models/vote.model.js";

import statsQueue from "../../../queues/stats.queue.js";

type TargetType = "QUESTION" | "ANSWER" | "REPLY";
type VoteType = "UPVOTE" | "DOWNVOTE";

type VoteMutationResult = {
  vote: any;
  previousVoteType: VoteType | null;
  currentVoteType: VoteType;
  didMutate: boolean;
};

const voteModelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
} as const;

const getVoteCountUpdate = (
  fromVoteType: VoteType | null,
  toVoteType: VoteType,
) => {
  if (!fromVoteType) {
    return toVoteType === "UPVOTE"
      ? { $inc: { upvoteCount: 1 } }
      : { $inc: { downvoteCount: 1 } };
  }

  if (fromVoteType === toVoteType) return null;

  return fromVoteType === "UPVOTE"
    ? { $inc: { upvoteCount: -1, downvoteCount: 1 } }
    : { $inc: { upvoteCount: 1, downvoteCount: -1 } };
};

const getVoteStatsAction = (
  targetType: TargetType,
  previousVoteType: VoteType | null,
  currentVoteType: VoteType,
) => {
  if (!previousVoteType) {
    return currentVoteType === "UPVOTE"
      ? `RECEIVE_UPVOTE_${targetType}`
      : `RECEIVE_DOWNVOTE_${targetType}`;
  }

  return previousVoteType === "UPVOTE"
    ? `CHANGE_UPVOTE_TO_DOWNVOTE_${targetType}`
    : `CHANGE_DOWNVOTE_TO_UPVOTE_${targetType}`;
};

const isDuplicateKeyError = (error: unknown) =>
  error instanceof Error &&
  ("code" in error
    ? (error as { code?: number }).code === 11000
    : /E11000/.test(error.message));

const getVoteEventId = (vote: any, targetType: TargetType) =>
  makeJobId(
    "vote",
    targetType,
    vote._id,
    vote.updatedAt ?? vote.createdAt ?? "",
  );

const mutateVote = async ({
  userId,
  targetType,
  targetId,
  voteType,
  targetDocument,
}: {
  userId: string;
  targetType: TargetType;
  targetId: string;
  voteType: VoteType;
  targetDocument: any;
}): Promise<VoteMutationResult> => {
  const Model = voteModelMap[targetType];

  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const currentVote = await Vote.findOne({
          userId,
          targetType,
          targetId,
        }).session(session);

        const currentVoteType = currentVote
          ? (String(currentVote.voteType).toUpperCase() as VoteType)
          : null;

        if (currentVoteType === voteType) {
          return {
            vote: currentVote,
            previousVoteType: currentVoteType,
            currentVoteType,
            didMutate: false,
          };
        }

        if (currentVote) {
          const updatedVote = await Vote.findByIdAndUpdate(
            currentVote._id,
            { voteType },
            { returnDocument: "after", session },
          );

          const updateField = getVoteCountUpdate(currentVoteType, voteType);

          if (!updateField)
            throw new Error("Vote update field missing for vote transition");

          await Model.findByIdAndUpdate(
            targetDocument._id || targetDocument.id,
            updateField,
            { session },
          );

          return {
            vote: updatedVote,
            previousVoteType: currentVoteType,
            currentVoteType: voteType,
            didMutate: true,
          };
        }

        const [createdVote] = await Vote.create(
          [{ userId, targetType, targetId, voteType }],
          { session },
        );

        const updateField = getVoteCountUpdate(null, voteType);

        if (!updateField)
          throw new Error("Vote update field missing for vote creation");

        await Model.findByIdAndUpdate(
          targetDocument._id || targetDocument.id,
          updateField,
          { session },
        );

        return {
          vote: createdVote,
          previousVoteType: null,
          currentVoteType: voteType,
          didMutate: true,
        };
      });

      session.endSession();
      return result;
    } catch (error) {
      session.endSession();

      if (isDuplicateKeyError(error) && attempt === 0) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Vote mutation retry exhausted");
};

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

    const voteMutation = await mutateVote({
      userId,
      targetType,
      targetId,
      voteType,
      targetDocument: foundQuestion,
    });

    if (!voteMutation.didMutate) {
      return {
        message: `This ${targetType.toLowerCase()} is already ${voteType.toLowerCase()}d`,
        vote: voteMutation.vote,
      };
    }

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundQuestion.userId as string,
        action: getVoteStatsAction(
          targetType,
          voteMutation.previousVoteType,
          voteMutation.currentVoteType,
        ),
        eventId: getVoteEventId(voteMutation.vote, targetType),
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "stats",
          "changeReputationPoints",
          targetType,
          targetId,
          voteMutation.vote._id,
          voteMutation.vote.updatedAt ?? voteMutation.vote.createdAt,
        ),
      },
    );

    if (voteType === "UPVOTE" && foundQuestion.tags?.length) {
      queueUserInterest({
        userId,
        tags: foundQuestion.tags as string[],
        action: "UPVOTE",
      }).catch(() => {});
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
      vote: voteMutation.vote,
    };
  }

  if (targetType === "ANSWER") {
    const foundAnswer = await Answer.findById(targetId);
    if (!foundAnswer) throw new HttpError("Answer not found", 404);
    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    const voteMutation = await mutateVote({
      userId,
      targetType,
      targetId,
      voteType,
      targetDocument: foundAnswer,
    });

    if (!voteMutation.didMutate) {
      return {
        message: `This ${targetType.toLowerCase()} is already ${voteType.toLowerCase()}d`,
        vote: voteMutation.vote,
      };
    }

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundAnswer.userId as string,
        action: getVoteStatsAction(
          targetType,
          voteMutation.previousVoteType,
          voteMutation.currentVoteType,
        ),
        eventId: getVoteEventId(voteMutation.vote, targetType),
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "stats",
          "changeReputationPoints",
          targetType,
          targetId,
          voteMutation.vote._id,
          voteMutation.vote.updatedAt ?? voteMutation.vote.createdAt,
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
      vote: voteMutation.vote,
    };
  }

  if (targetType === "REPLY") {
    const foundReply = await Reply.findById(targetId);
    if (!foundReply) throw new HttpError("Reply not found", 404);
    if (foundReply.isDeleted || !foundReply.isActive)
      throw new HttpError("Reply not active", 410);

    const voteMutation = await mutateVote({
      userId,
      targetType,
      targetId,
      voteType,
      targetDocument: foundReply,
    });

    if (!voteMutation.didMutate) {
      return {
        message: `This ${targetType.toLowerCase()} is already ${voteType.toLowerCase()}d`,
        vote: voteMutation.vote,
      };
    }

    await statsQueue.add(
      "CHANGE_REPUTATION_POINTS",
      {
        userId: foundReply.userId as string,
        action: getVoteStatsAction(
          targetType,
          voteMutation.previousVoteType,
          voteMutation.currentVoteType,
        ),
        eventId: getVoteEventId(voteMutation.vote, targetType),
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "stats",
          "changeReputationPoints",
          targetType,
          targetId,
          voteMutation.vote._id,
          voteMutation.vote.updatedAt ?? voteMutation.vote.createdAt,
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
      vote: voteMutation.vote,
    };
  }

  throw new HttpError("Invalid vote target", 400);
};

export default vote;
