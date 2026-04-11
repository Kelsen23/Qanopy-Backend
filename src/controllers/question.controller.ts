import { Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import { clearAnswerCache, clearReplyCache } from "../utils/clearCache.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import HttpError from "../utils/httpError.util.js";

import voteService from "../services/question/vote.service.js";
import unvoteService from "../services/question/unvote.service.js";
import deleteContentService from "../services/question/deleteContent.service.js";
import markAnswerAsBestService from "../services/question/markAnswerAsBest.service.js";
import unmarkAnswerAsBestService from "../services/question/unmarkAnswerAsBest.service.js";
import editQuestionService from "../services/question/editQuestion.service.js";
import rollbackVersionService from "../services/question/rollbackVersion.service.js";
import publishAiAnswerService from "../services/question/publishAiAnswer.service.js";
import unpublishAiAnswerService from "../services/question/unpublishAiAnswer.service.js";
import createFeedbackOnAiAnswerService from "../services/question/createFeedbackOnAiAnswer.service.js";
import editFeedbackOnAiAnswerService from "../services/question/editFeedbackOnAiAnswer.service.js";
import deleteFeedbackOnAiAnswerService from "../services/question/deleteFeedbackOnAiAnswer.service.js";

import prisma from "../config/prisma.config.js";

import mongoose from "mongoose";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

import AiSuggestion from "../models/aiSuggestion.model.js";
import AiAnswer from "../models/aiAnswer.model.js";

import { getRedisCacheClient } from "../config/redis.config.js";

import statsQueue from "../queues/stats.queue.js";
import contentModerationQueue from "../queues/contentModeration.queue.js";
import contentFinalizeQueue from "../queues/contentFinalize.queue.js";
import aiSuggestionQueue from "../queues/aiSuggestion.queue.js";
import aiAnswerQueue from "../queues/aiAnswer.queue.js";

const createQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { title, body, tags } = req.body;

    const newQuestion = await Question.create({
      userId,
      title,
      body,
      tags,
    });

    await statsQueue.add(
      "ASK_QUESTION",
      {
        userId,
        action: "ASK_QUESTION",
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "askQuestion", newQuestion._id),
      },
    );

    await contentFinalizeQueue.add(
      "QUESTION",
      {
        userId,
        entityId: newQuestion._id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("contentFinalize", "QUESTION", newQuestion._id),
      },
    );

    return res.status(201).json({
      message: "Successfully created question",
      question: newQuestion,
    });
  },
);

const createAnswerOnQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { body } = req.body;
    const { questionId } = req.params;

    const cachedQuestion = await getRedisCacheClient().get(
      `question:${questionId}`,
    );
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const newAnswer = await Answer.create({
      questionId,
      body,
      userId,
      questionVersion: foundQuestion.currentVersion,
    });

    await getRedisCacheClient().del(`question:${questionId}`);
    await clearAnswerCache(questionId);

    await statsQueue.add(
      "GIVE_ANSWER",
      {
        userId,
        action: "GIVE_ANSWER",
        mongoTargetId: foundQuestion._id || foundQuestion.id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "giveAnswer", newAnswer._id),
      },
    );

    await contentFinalizeQueue.add(
      "ANSWER",
      {
        userId,
        entityId: newAnswer._id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("contentFinalize", "ANSWER", newAnswer._id),
      },
    );

    return res
      .status(201)
      .json({ message: "Successfully created answer", answer: newAnswer });
  },
);

const createReplyOnAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { body } = req.body;
    const answerId = req.params.answerId;

    const foundAnswer = await Answer.findById(answerId).lean();

    if (!foundAnswer) throw new HttpError("Answer not found", 404);

    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    const foundQuestion = await Question.findById(
      foundAnswer.questionId,
    ).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const newReply = await Reply.create({ answerId, userId, body });

    await statsQueue.add(
      "GIVE_REPLY",
      {
        userId,
        action: "GIVE_REPLY",
        mongoTargetId: foundAnswer._id || foundAnswer.id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "giveReply", newReply._id),
      },
    );

    await contentModerationQueue.add(
      "REPLY",
      { contentId: newReply._id },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("contentModeration", "REPLY", newReply._id),
      },
    );

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);
    await clearReplyCache(foundAnswer._id as string);

    return res
      .status(201)
      .json({ message: "Successfully created reply", reply: newReply });
  },
);

const vote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user.id;

  const { message, vote } = await voteService(userId, req.body);

  return res.status(200).json({
    message,
    vote,
  });
});

const unvote = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { targetType, targetId } = req.params;

    const { message } = await unvoteService(userId, targetType, targetId);

    return res.status(200).json({ message });
  },
);

const acceptAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { answerId } = req.params;

    const foundAnswer = await Answer.findById(answerId).lean();

    if (!foundAnswer) throw new HttpError("Answer not found", 404);

    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    const cachedQuestion = await getRedisCacheClient().get(
      `question:${foundAnswer.questionId}`,
    );
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(foundAnswer.questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (foundQuestion.userId?.toString() !== userId)
      throw new HttpError("Unauthorized to accept answer", 403);

    if (foundAnswer.isAccepted) {
      return res.status(200).json({
        message: "Answer already accepted",
        answer: foundAnswer,
      });
    }

    const acceptedAnswer = await Answer.findByIdAndUpdate(
      answerId,
      { isAccepted: true },
      { new: true },
    );

    await statsQueue.add(
      "ACCEPT_ANSWER",
      {
        userId,
        action: "ACCEPT_ANSWER",
        mongoTargetId: foundQuestion._id || foundQuestion.id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "acceptAnswer", answerId),
      },
    );

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    return res
      .status(200)
      .json({ message: "Successfully accepted answer", acceptedAnswer });
  },
);

const unacceptAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { answerId } = req.params;

    const foundAnswer = await Answer.findById(answerId).lean();

    if (!foundAnswer) throw new HttpError("Answer not found", 404);

    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    const cachedQuestion = await getRedisCacheClient().get(
      `question:${foundAnswer.questionId}`,
    );
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(foundAnswer.questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (foundQuestion.userId?.toString() !== userId)
      throw new HttpError("Unauthorized to unaccept answer", 403);

    if (!foundAnswer.isAccepted) {
      return res.status(200).json({
        message: "Answer already unaccepted",
        answer: foundAnswer,
      });
    }

    const unacceptedAnswer = await Answer.findByIdAndUpdate(
      foundAnswer._id,
      {
        isAccepted: false,
        isBestAnswerByAsker: false,
      },
      { new: true },
    );

    if (foundAnswer.isBestAnswerByAsker) {
      await statsQueue.add(
        "UNACCEPT_BEST_ANSWER",
        {
          userId,
          action: "UNACCEPT_BEST_ANSWER",
          mongoTargetId: foundQuestion._id || foundQuestion.id,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("stats", "unacceptBestAnswer", answerId),
        },
      );
    } else {
      await statsQueue.add(
        "UNACCEPT_ANSWER",
        {
          userId,
          action: "UNACCEPT_ANSWER",
          mongoTargetId: foundQuestion._id || foundQuestion.id,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("stats", "unacceptAnswer", answerId),
        },
      );
    }

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    return res
      .status(200)
      .json({ message: "Successfully unaccepted answer", unacceptedAnswer });
  },
);

const markAnswerAsBest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { answerId } = req.params;

    const result = await markAnswerAsBestService(userId, answerId);

    return res.status(200).json(result);
  },
);

const unmarkAnswerAsBest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { answerId } = req.params;

    const result = await unmarkAnswerAsBestService(userId, answerId);

    return result;
  },
);

const editQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;

    const result = await editQuestionService(userId, questionId, req.body);

    return res.status(200).json(result);
  },
);

const generateSuggestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;
    const { version } = req.body;
    const versionNumber = Number(version);

    if (!mongoose.Types.ObjectId.isValid(questionId))
      throw new HttpError("Invalid questionId", 400);

    const cachedQuestion = await getRedisCacheClient().get(
      `question:${questionId}`,
    );
    let foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findOne({
          _id: questionId,
          userId,
        })
          .select(
            "_id isActive currentVersion moderationStatus topicStatus embedding",
          )
          .lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);
    if (!foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (
      !["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus))
    )
      throw new HttpError("Question moderation status is not eligible", 400);

    if (foundQuestion.topicStatus !== "VALID")
      throw new HttpError("Question topic is not valid", 400);

    if (
      !Array.isArray(foundQuestion.embedding) ||
      foundQuestion.embedding.length === 0
    )
      throw new HttpError("Question does not have embedding", 400);

    if (Number(foundQuestion.currentVersion) !== versionNumber)
      throw new HttpError(
        `Stale version. Current version is ${foundQuestion.currentVersion}`,
        409,
      );

    const foundAiSuggestion = await AiSuggestion.findOne({
      questionId,
      version: versionNumber,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!foundAiSuggestion) {
      const pendingKey = `aiSuggestion:pending:${userId}:${questionId}:${versionNumber}`;
      const pendingSet = await getRedisCacheClient().set(
        pendingKey,
        "1",
        "EX",
        60 * 15,
        "NX",
      );

      if (!pendingSet) throw new HttpError("AI suggestion already queued", 409);

      const cachedCredits = await getRedisCacheClient().get(
        `credits:${userId}`,
      );

      if (cachedCredits && JSON.parse(cachedCredits) < 5) {
        await getRedisCacheClient().del(pendingKey);

        throw new HttpError("Not enough credits", 400);
      }

      const updatedUser = await prisma.user.updateMany({
        where: { id: userId, credits: { gte: 5 } },
        data: { credits: { decrement: 5 } },
      });

      if (updatedUser.count === 0) {
        await getRedisCacheClient().del(pendingKey);

        throw new HttpError("Not enough credits", 400);
      }

      await getRedisCacheClient().del(`credits:${userId}`, `user:${userId}`);

      try {
        await aiSuggestionQueue.add(
          "GENERATE_SUGGESTION",
          {
            userId,
            questionId,
            version: versionNumber,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "aiSuggestion",
              "GENERATE_SUGGESTION",
              userId,
              questionId,
              versionNumber,
            ),
          },
        );
      } catch (error) {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: 5 } },
        });

        await getRedisCacheClient().del(
          `credits:${userId}`,
          `user:${userId}`,
          pendingKey,
        );

        throw error;
      }

      return res.status(202).json({ message: "AI suggestion queued" });
    } else
      return res.status(200).json({
        message: "AI suggestion successfully received",
        suggestion: foundAiSuggestion,
      });
  },
);

const generateAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;
    const { version } = req.body;
    const versionNumber = Number(version);

    if (!mongoose.Types.ObjectId.isValid(questionId))
      throw new HttpError("Invalid questionId", 400);

    const cachedQuestion = await getRedisCacheClient().get(
      `question:${questionId}`,
    );
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findOne({
          _id: questionId,
          userId,
        })
          .select(
            "_id isActive currentVersion moderationStatus topicStatus embedding",
          )
          .lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);
    if (!foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (Number(foundQuestion.currentVersion) !== versionNumber)
      throw new HttpError(
        `Stale version. Current version is ${foundQuestion.currentVersion}`,
        409,
      );

    if (
      !["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus))
    )
      throw new HttpError("Question moderation status is not eligible", 400);

    if (foundQuestion.topicStatus !== "VALID")
      throw new HttpError("Question topic is not valid", 400);

    if (
      !Array.isArray(foundQuestion.embedding) ||
      foundQuestion.embedding.length === 0
    )
      throw new HttpError("Question does not have embedding", 400);

    const foundAiAnswer = await AiAnswer.findOne({
      questionId,
      questionVersion: versionNumber,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!foundAiAnswer) {
      const pendingKey = `aiAnswer:pending:${userId}:${questionId}:${versionNumber}`;
      const pendingSet = await getRedisCacheClient().set(
        pendingKey,
        "1",
        "EX",
        60 * 15,
        "NX",
      );

      if (!pendingSet) throw new HttpError("AI answer already queued", 409);

      const cachedCredits = await getRedisCacheClient().get(
        `credits:${userId}`,
      );

      if (cachedCredits && JSON.parse(cachedCredits) < 5) {
        await getRedisCacheClient().del(pendingKey);

        throw new HttpError("Not enough credits", 400);
      }

      const updatedUser = await prisma.user.updateMany({
        where: { id: userId, credits: { gte: 5 } },
        data: { credits: { decrement: 5 } },
      });

      if (updatedUser.count === 0) {
        await getRedisCacheClient().del(pendingKey);

        throw new HttpError("Not enough credits", 400);
      }

      await getRedisCacheClient().del(`credits:${userId}`, `user:${userId}`);

      try {
        await aiAnswerQueue.add(
          "GENERATE_AI_ANSWER",
          {
            userId,
            questionId,
            version: versionNumber,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "aiAnswer",
              "GENERATE_AI_ANSWER",
              userId,
              questionId,
              versionNumber,
            ),
          },
        );
      } catch (error) {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: 5 } },
        });

        await getRedisCacheClient().del(
          `credits:${userId}`,
          `user:${userId}`,
          pendingKey,
        );

        throw error;
      }

      return res.status(202).json({ message: "AI answer queued" });
    } else
      return res.status(200).json({
        message: "AI answer successfully received",
        answer: foundAiAnswer,
      });
  },
);

const rollbackVersion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId, version } = req.params;

    const result = await rollbackVersionService(
      userId,
      questionId,
      Number(version),
    );

    return res.status(200).json(result);
  },
);

const publishAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;
    const { aiAnswerId } = req.body;

    const result = await publishAiAnswerService(userId, questionId, aiAnswerId);

    return res.status(200).json(result);
  },
);

const unpublishAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;
    const { aiAnswerId } = req.body;

    const result = await unpublishAiAnswerService(
      userId,
      questionId,
      aiAnswerId,
    );

    return res.status(200).json(result);
  },
);

const createFeedbackOnAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const result = await createFeedbackOnAiAnswerService(userId, req.body);

    return res.status(201).json(result);
  },
);

const editFeedbackOnAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const result = await editFeedbackOnAiAnswerService(userId, req.body);

    return res.status(200).json(result);
  },
);

const deleteFeedbackOnAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const result = await deleteFeedbackOnAiAnswerService(userId, req.body);

    return res.status(200).json(result);
  },
);

const deleteContent = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { targetType, targetId } = req.params;

    const { message } = await deleteContentService(
      userId,
      targetType,
      targetId,
    );

    return res.status(200).json({ message });
  },
);

export {
  createQuestion,
  createAnswerOnQuestion,
  createReplyOnAnswer,
  vote,
  unvote,
  acceptAnswer,
  unacceptAnswer,
  markAnswerAsBest,
  unmarkAnswerAsBest,
  editQuestion,
  generateSuggestion,
  generateAiAnswer,
  rollbackVersion,
  publishAiAnswer,
  unpublishAiAnswer,
  createFeedbackOnAiAnswer,
  editFeedbackOnAiAnswer,
  deleteFeedbackOnAiAnswer,
  deleteContent,
};
