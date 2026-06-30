import express from "express";

import {
  acceptAnswer,
  createAnswerOnQuestion,
  createFeedbackOnAiAnswer,
  createQuestion,
  createReplyOnAnswer,
  deleteContent,
  deleteFeedbackOnAiAnswer,
  editFeedbackOnAiAnswer,
  editQuestion,
  rollbackVersion,
  generateAiAnswer,
  generateSuggestion,
  markAnswerAsBest,
  publishAiAnswer,
  unacceptAnswer,
  unmarkAnswerAsBest,
  unpublishAiAnswer,
  unvote,
  vote,
} from "../controllers/question.controller.js";

import isAuthenticated, {
  isVerified,
  requireActiveUser,
} from "../middlewares/auth.middleware.js";

import {
  createAnswerOnQuestionSchema,
  createFeedbackOnAiAnswerSchema,
  deleteAiFeedbackSchema,
  editAiFeedbackSchema,
  generateAiAnswerSchema,
  generateSuggestionSchema,
  createQuestionSchema,
  editQuestionSchema,
  createReplyOnAnswerSchema,
  publishAiAnswerSchema,
  unpublishAiAnswerSchema,
  voteSchema,
} from "../validations/question.schema.js";

import {
  acceptAnswerLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createFeedbackOnAiAnswerLimiterMiddleware,
  createQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  deleteAiFeedbackLimiterMiddleware,
  deleteContentLimiterMiddleware,
  editAiFeedbackLimiterMiddleware,
  editQuestionLimiterMiddleware,
  generateAiAnswerLimiterMiddleware,
  generateSuggestionLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
  unmarkAnswerAsBestLimiterMiddleware,
  unacceptAnswerLimiterMiddleware,
  unvoteLimiterMiddleware,
  voteLimiterMiddleware,
  publishAiAnswerLimiterMiddleware,
  unpublishAiAnswerLimiterMiddleware,
} from "../middlewares/rate-limiters/question.rate-limiters.js";

import validate from "../middlewares/validate.middleware.js";

const router = express.Router();

router
  .route("/")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createQuestionLimiterMiddleware,
    validate(createQuestionSchema),
    createQuestion,
  );

router
  .route("/:questionId/answers")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createAnswerOnQuestionLimiterMiddleware,
    validate(createAnswerOnQuestionSchema),
    createAnswerOnQuestion,
  );

router
  .route("/answers/:answerId/replies")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createReplyOnAnswerLimiterMiddleware,
    validate(createReplyOnAnswerSchema),
    createReplyOnAnswer,
  );

router
  .route("/votes")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    voteLimiterMiddleware,
    validate(voteSchema),
    vote,
  );

router
  .route("/votes/:targetType/:targetId")
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unvoteLimiterMiddleware,
    unvote,
  );

router
  .route("/answers/:answerId/accept")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    acceptAnswerLimiterMiddleware,
    acceptAnswer,
  )
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unacceptAnswerLimiterMiddleware,
    unacceptAnswer,
  );

router
  .route("/answers/:answerId/best")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    markAnswerAsBestLimiterMiddleware,
    markAnswerAsBest,
  )
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unmarkAnswerAsBestLimiterMiddleware,
    unmarkAnswerAsBest,
  );

router
  .route("/:questionId")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    editQuestionLimiterMiddleware,
    validate(editQuestionSchema),
    editQuestion,
  );

router
  .route("/:questionId/versions/:version/rollback")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    rollbackVersionLimiterMiddleware,
    rollbackVersion,
  );

router
  .route("/content/:targetType/:targetId")
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    deleteContentLimiterMiddleware,
    deleteContent,
  );

router
  .route("/:questionId/ai/suggestion")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    generateSuggestionLimiterMiddleware,
    validate(generateSuggestionSchema),
    generateSuggestion,
  );

router
  .route("/:questionId/ai/answer")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    generateAiAnswerLimiterMiddleware,
    validate(generateAiAnswerSchema),
    generateAiAnswer,
  );

router
  .route("/:questionId/ai/answer/publish")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    publishAiAnswerLimiterMiddleware,
    validate(publishAiAnswerSchema),
    publishAiAnswer,
  );

router
  .route("/:questionId/ai/answer/unpublish")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unpublishAiAnswerLimiterMiddleware,
    validate(unpublishAiAnswerSchema),
    unpublishAiAnswer,
  );

router
  .route("/ai/answer/feedback/create")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createFeedbackOnAiAnswerLimiterMiddleware,
    validate(createFeedbackOnAiAnswerSchema),
    createFeedbackOnAiAnswer,
  );

router
  .route("/ai/answer/feedback/edit")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    editAiFeedbackLimiterMiddleware,
    validate(editAiFeedbackSchema),
    editFeedbackOnAiAnswer,
  );

router
  .route("/ai/answer/feedback/delete")
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    deleteAiFeedbackLimiterMiddleware,
    validate(deleteAiFeedbackSchema),
    deleteFeedbackOnAiAnswer,
  );

export default router;
