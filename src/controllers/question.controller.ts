import { Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import { clearAnswerCache, clearReplyCache } from "../utils/clearCache.util.js";

import HttpError from "../utils/httpError.util.js";

import voteService from "../services/question/vote.service.js";
import unvoteService from "../services/question/unvote.service.js";
import deleteContentService from "../services/question/deleteContent.service.js";
import markAnswerAsBestService from "../services/question/markAnswerAsBest.service.js";
import unmarkAnswerAsBestService from "../services/question/unmarkAnswerAsBest.service.js";
import editQuestionService from "../services/question/editQuestion.service.js";
import rollbackVersionService from "../services/question/rollbackVersion.service.js";

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

    await statsQueue.add("askQuestion", {
      userId,
      action: "ASK_QUESTION",
    });

    await contentFinalizeQueue.add("Question", {
      userId,
      entityId: newQuestion._id,
    });

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

    await statsQueue.add("giveAnswer", {
      userId,
      action: "GIVE_ANSWER",
      mongoTargetId: foundQuestion._id || foundQuestion.id,
    });

    await contentFinalizeQueue.add("Answer", {
      userId,
      entityId: newAnswer._id,
    });

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

    await statsQueue.add("giveReply", {
      userId,
      action: "GIVE_REPLY",
      mongoTargetId: foundAnswer._id || foundAnswer.id,
    });

    await contentModerationQueue.add("Reply", { contentId: newReply._id });

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

    await statsQueue.add("acceptAnswer", { userId, action: "ACCEPT_ANSWER" });

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
      await statsQueue.add("unacceptBestAnswer", {
        userId,
        action: "UNACCEPT_BEST_ANSWER",
      });
    } else {
      await statsQueue.add("unacceptAnswer", {
        userId,
        action: "UNACCEPT_ANSWER",
      });
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
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findOne({
          _id: questionId,
          userId,
          $or: [
            { moderationStatus: "APPROVED" },
            { moderationStatus: "FLAGGED" },
          ],
          topicStatus: "VALID",
        })
          .select("_id isActive currentVersion")
          .lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);
    if (!foundQuestion.isActive)
      throw new HttpError("Question not active", 410);
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
        await aiSuggestionQueue.add("generateSuggestion", {
          userId,
          questionId,
          version: versionNumber,
        });
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
          $or: [
            { moderationStatus: "APPROVED" },
            { moderationStatus: "FLAGGED" },
          ],
          topicStatus: "VALID",
        })
          .select("_id isActive currentVersion")
          .lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);
    if (!foundQuestion.isActive)
      throw new HttpError("Question not active", 410);
    if (Number(foundQuestion.currentVersion) !== versionNumber)
      throw new HttpError(
        `Stale version. Current version is ${foundQuestion.currentVersion}`,
        409,
      );

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
        await aiAnswerQueue.add("generateAiAnswer", {
          userId,
          questionId,
          version: versionNumber,
        });
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
  deleteContent,
};
