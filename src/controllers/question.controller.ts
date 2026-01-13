import { Response } from "express";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import {
  clearAnswerCache,
  clearReplyCache,
  clearVersionHistoryCache,
} from "../utils/clearCache.util.js";

import HttpError from "../utils/httpError.util.js";

import voteService from "../services/question/vote.service.js";
import unvoteService from "../services/question/unvote.service.js";
import deleteContentService from "../services/question/deleteContent.service.js";

import mongoose from "mongoose";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";
import QuestionVersion from "../models/questionVersion.model.js";

import { redisCacheClient } from "../config/redis.config.js";

import questionVersioningQueue from "../queues/questionVersioning.queue.js";
import statsQueue from "../queues/stats.queue.js";

const createQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { title, body, tags } = req.body;

    const createdQuestion = await Question.create({
      userId,
      title,
      body,
      tags,
    });

    await statsQueue.add("askQuestion", {
      userId,
      action: "ASK_QUESTION",
    });

    await questionVersioningQueue.add(
      "createNewQuestionVersion",
      {
        questionId: createdQuestion._id,
        title,
        body,
        tags,
        editorId: userId,
        version: 1,
        basedOnVersion: 1,
      },
      { removeOnComplete: true, removeOnFail: false },
    );

    return res.status(201).json({
      message: "Successfully created question",
      question: createdQuestion,
    });
  },
);

const createAnswerOnQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { body } = req.body;
    const { questionId } = req.params;

    const foundQuestion = await Question.findById(questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const newAnswer = await Answer.create({
      questionId,
      body,
      userId,
      questionVersion: foundQuestion.currentVersion,
    });

    await statsQueue.add("giveAnswer", {
      userId,
      action: "GIVE_ANSWER",
      mongoTargetId: foundQuestion._id || foundQuestion.id,
    });

    await redisCacheClient.del(`question:${questionId}`);
    await clearAnswerCache(questionId);

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

    const foundQuestion = await Question.findById(foundAnswer.questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const newReply = await Reply.create({ answerId, userId, body });

    await statsQueue.add("giveReply", {
      userId,
      action: "GIVE_REPLY",
      mongoTargetId: foundAnswer._id || foundAnswer.id,
    });

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
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

    const cachedQuestion = await redisCacheClient.get(
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

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
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

    const cachedQuestion = await redisCacheClient.get(
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

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
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

    const foundAnswer = await Answer.findById(answerId).lean();

    if (!foundAnswer) throw new HttpError("Answer not found", 404);

    if (foundAnswer.isDeleted || !foundAnswer.isActive)
      throw new HttpError("Answer not active", 410);

    if (!foundAnswer.isAccepted)
      throw new HttpError(
        "Answer first needs to be accepted before marking it best",
        400,
      );

    if (foundAnswer.isBestAnswerByAsker) {
      return res.status(200).json({
        message: "Answer is already marked as best",
        answer: foundAnswer,
      });
    }

    const cachedQuestion = await redisCacheClient.get(
      `question:${foundAnswer.questionId}`,
    );

    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(foundAnswer.questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.userId.toString() !== userId)
      throw new HttpError("Unauthorized to mark as best answer", 403);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const bestAnswer = await Answer.findOne({
      questionId: foundAnswer.questionId,
      isBestAnswerByAsker: true,
    });

    if (bestAnswer) {
      await Answer.findByIdAndUpdate(bestAnswer._id, {
        $set: { isBestAnswerByAsker: false },
      });

      await statsQueue.add("unmarkAsBest", {
        userId: bestAnswer.userId as string,
        action: "UNMARK_ANSWER_AS_BEST",
      });
    }

    const newBestAnswer = await Answer.findByIdAndUpdate(foundAnswer._id, {
      $set: { isBestAnswerByAsker: true },
    });

    if (!newBestAnswer)
      throw new HttpError("Error marking answer as best", 500);

    await statsQueue.add("unmarkAsBest", {
      userId: newBestAnswer.userId as string,
      action: "MARK_ANSWER_AS_BEST",
    });

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    return res.status(200).json({
      message: "Successfully marked answer as best",
      answer: newBestAnswer,
    });
  },
);

const unmarkAnswerAsBest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { answerId } = req.params;

    const foundAnswer = await Answer.findById(answerId).lean();

    if (!foundAnswer) throw new HttpError("Answer not found", 404);

    const cachedQuestion = await redisCacheClient.get(
      `question:${foundAnswer.questionId}`,
    );
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(foundAnswer.questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.userId.toString() !== userId)
      throw new HttpError("Unauthorized to unmark best answer", 403);

    if (!foundAnswer.isBestAnswerByAsker) {
      return res.status(200).json({
        message: "Answer is already unmarked as best",
        answer: foundAnswer,
      });
    }

    const updatedAnswer = await Answer.findByIdAndUpdate(
      foundAnswer._id,
      {
        $set: { isBestAnswerByAsker: false },
      },
      { new: true },
    );

    await statsQueue.add("unmarkAsBest", {
      userId: foundAnswer.userId as string,
      action: "UNMARK_ANSWER_AS_BEST",
    });

    await redisCacheClient.del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);

    return res.status(200).json({
      message: "Successfully unmarked answer as best",
      answer: updatedAnswer,
    });
  },
);

const editQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId } = req.params;
    const { title, body, tags } = req.body;

    const cachedQuestion = await redisCacheClient.get(`question:${questionId}`);
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    const sameTags =
      tags.length === foundQuestion.tags.length &&
      [...tags].sort().join(",") === [...foundQuestion.tags].sort().join(",");

    if (
      title === foundQuestion.title &&
      body === foundQuestion.body &&
      sameTags
    )
      throw new HttpError(
        "In order to edit the question, at least one field must be different from the old one",
        400,
      );

    if (foundQuestion.userId?.toString() !== userId)
      throw new HttpError("Unauthorized to edit question", 403);

    const newVersion = Number(foundQuestion.currentVersion) + 1;

    const editedQuestion = await Question.findByIdAndUpdate(
      foundQuestion._id || foundQuestion.id,
      {
        title,
        body,
        tags,
        currentVersion: newVersion,
      },
      { new: true },
    );

    await questionVersioningQueue.add(
      "createNewQuestionVersion",
      {
        questionId,
        title,
        body,
        tags,
        editorId: userId,
        version: newVersion,
        basedOnVersion: foundQuestion.currentVersion,
      },
      { removeOnComplete: true, removeOnFail: false },
    );

    await redisCacheClient.del(`question:${editedQuestion?._id}`);
    await clearVersionHistoryCache(questionId);

    return res
      .status(200)
      .json({ message: "Successfully edited question", editedQuestion });
  },
);

const rollbackVersion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { questionId, version } = req.params;

    const cachedQuestion = await redisCacheClient.get(`question:${questionId}`);
    const foundQuestion = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Question.findById(questionId).lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (foundQuestion.isDeleted || !foundQuestion.isActive)
      throw new HttpError("Question not active", 410);

    if (foundQuestion.userId !== userId)
      throw new HttpError("Unauthorized to edit question", 403);

    if (foundQuestion.currentVersion <= version)
      throw new HttpError("Invalid passed version", 400);

    const cachedVersion = await redisCacheClient.get(
      `v:${version}:question:${questionId}`,
    );
    const foundVersion = cachedVersion
      ? JSON.parse(cachedVersion)
      : await QuestionVersion.findOne({ questionId, version });

    if (!foundVersion) throw new HttpError("Version not found", 404);

    if (foundVersion.isActive)
      throw new HttpError("Could not rollback to active version", 400);

    const session = await mongoose.startSession();
    let newVersion;

    await session.withTransaction(async () => {
      await QuestionVersion.updateOne(
        { questionId, isActive: true },
        { $set: { isActive: false } },
        { session },
      );

      await QuestionVersion.updateMany(
        {
          questionId,
          version: { $gt: foundVersion.version },
          isActive: false,
        },
        {
          $set: { supersededByRollback: true },
        },
        { session },
      );

      const newVersionNumber = Number(foundQuestion.currentVersion) + 1;

      const [createdVersion] = await QuestionVersion.create(
        [
          {
            questionId,
            version: newVersionNumber,
            title: foundVersion.title,
            body: foundVersion.body,
            tags: foundVersion.tags,
            editedBy: foundVersion.editedBy,
            editorId: foundVersion.editorId,
            basedOnVersion: foundVersion.version,
            isActive: true,
          },
        ],
        { session },
      );

      newVersion = createdVersion;

      await Question.findByIdAndUpdate(
        foundQuestion._id || foundQuestion.id,
        {
          title: foundVersion.title,
          body: foundVersion.body,
          tags: foundVersion.tags,
          currentVersion: newVersionNumber,
        },
        { session },
      );
    });

    session.endSession();

    await redisCacheClient.del(
      `question:${questionId}`,
      `v:${version}:question:${questionId}`,
      `v:${foundQuestion.currentVersion}:question:${questionId}`,
    );
    await clearVersionHistoryCache(questionId);

    return res
      .status(200)
      .json({ message: "Successfully rolled back", newVersion });
  },
);

const deleteContent = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { targetType, targetId } = req.params;

    const { message } = await deleteContentService(userId, targetType, targetId);

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
  rollbackVersion,
  deleteContent,
};
