import { Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import refundCreditCharge from "../services/user/credits/refundCreditCharge.service.js";
import {
  acceptAnswer as acceptAnswerService,
  createAnswerOnQuestion as createAnswerOnQuestionService,
  createFeedbackOnAiAnswer as createFeedbackOnAiAnswerService,
  createQuestion as createQuestionService,
  createReplyOnAnswer as createReplyOnAnswerService,
  deleteContent as deleteContentService,
  editFeedbackOnAiAnswer as editFeedbackOnAiAnswerService,
  editQuestion as editQuestionService,
  generateAiAnswerRequest as generateAiAnswerRequestService,
  generateSuggestionRequest as generateSuggestionRequestService,
  markAnswerAsBest as markAnswerAsBestService,
  publishAiAnswer as publishAiAnswerService,
  rollbackVersion as rollbackVersionService,
  unacceptAnswer as unacceptAnswerService,
  unmarkAnswerAsBest as unmarkAnswerAsBestService,
  unpublishAiAnswer as unpublishAiAnswerService,
  unvote as unvoteService,
  vote as voteService,
} from "../services/question/question.service.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

const createQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const result = await createQuestionService({ userId, ...req.body });

    return res.status(201).json(result);
  },
);

const createAnswerOnQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId } = req.params;

    const result = await createAnswerOnQuestionService({
      userId,
      questionId,
      body: req.body.body,
    });

    return res.status(201).json(result);
  },
);

const createReplyOnAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { answerId } = req.params;

    const result = await createReplyOnAnswerService({
      userId,
      answerId,
      body: req.body.body,
    });

    return res.status(201).json(result);
  },
);

const vote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: userId } = req.user;

  const { message, vote } = await voteService(userId, req.body);

  return res.status(200).json({ message, vote });
});

const unvote = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { targetType, targetId } = req.params;

    const { message } = await unvoteService(userId, targetType, targetId);

    return res.status(200).json({ message });
  },
);

const acceptAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { answerId } = req.params;

    const result = await acceptAnswerService(userId, answerId);

    return res.status(200).json(result);
  },
);

const unacceptAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { answerId } = req.params;

    const result = await unacceptAnswerService(userId, answerId);

    return res.status(200).json(result);
  },
);

const markAnswerAsBest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { answerId } = req.params;

    const result = await markAnswerAsBestService(userId, answerId);

    return res.status(200).json(result);
  },
);

const unmarkAnswerAsBest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { answerId } = req.params;

    const result = await unmarkAnswerAsBestService(userId, answerId);

    return res.status(200).json(result);
  },
);

const editQuestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId } = req.params;

    const result = await editQuestionService(userId, questionId, req.body);

    return res.status(200).json(result);
  },
);

const rollbackVersion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId, version } = req.params;

    const result = await rollbackVersionService(
      userId,
      questionId,
      Number(version),
    );

    return res.status(200).json(result);
  },
);

const generateSuggestion = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId } = req.params;

    let result;
    try {
      result = await generateSuggestionRequestService(
        userId,
        questionId,
        Number(req.body.version),
        req.creditCharge,
      );
    } catch (error) {
      if (req.creditCharge?.chargedNow) {
        await refundCreditCharge({
          operationKey: req.creditCharge.operationKey,
          reason: "AI suggestion request failed",
        });
      }

      throw error;
    }

    return res.status(200).json(result);
  },
);

const generateAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId } = req.params;

    let result;
    try {
      result = await generateAiAnswerRequestService(
        userId,
        questionId,
        Number(req.body.version),
        req.creditCharge,
      );
    } catch (error) {
      if (req.creditCharge?.chargedNow) {
        await refundCreditCharge({
          operationKey: req.creditCharge.operationKey,
          reason: "AI answer request failed",
        });
      }

      throw error;
    }

    return res.status(200).json(result);
  },
);

const publishAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
    const { questionId } = req.params;
    const { aiAnswerId } = req.body;

    const result = await publishAiAnswerService(userId, questionId, aiAnswerId);

    return res.status(200).json(result);
  },
);

const unpublishAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
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
    const { id: userId } = req.user;

    const result = await createFeedbackOnAiAnswerService(userId, req.body);

    return res.status(201).json(result);
  },
);

const editFeedbackOnAiAnswer = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;

    const result = await editFeedbackOnAiAnswerService(userId, req.body);

    return res.status(200).json(result);
  },
);

const deleteContent = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: userId } = req.user;
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
  rollbackVersion,
  generateSuggestion,
  generateAiAnswer,
  publishAiAnswer,
  unpublishAiAnswer,
  createFeedbackOnAiAnswer,
  editFeedbackOnAiAnswer,
  deleteContent,
};
