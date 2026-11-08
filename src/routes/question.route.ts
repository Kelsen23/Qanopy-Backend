import express from "express";

import {
  acceptAnswer,
  createAnswerOnQuestion,
  createFeedbackOnAiAnswer,
  createQuestion,
  createReplyOnAnswer,
  deleteContent,
  editFeedbackOnAiAnswer,
  editQuestion,
  rollbackVersion,
  generateQuestionSuggestion,
  generateAiAnswer,
  retryBlockedAiAnswerGeneration,
  getQuestionSettings,
  markAnswerAsBest,
  unacceptAnswer,
  unmarkAnswerAsBest,
  unvote,
  updateQuestionSettings,
  vote,
} from "../controllers/question.controller.js";
import isAuthenticated, {
  isVerified,
  requireActiveUser,
} from "../middlewares/auth.middleware.js";
import {
  answerIdSchema,
  contentTargetSchema,
  createAnswerOnQuestionSchema,
  createFeedbackOnAiAnswerSchema,
  editAiFeedbackSchema,
  createQuestionSchema,
  editQuestionSchema,
  createReplyOnAnswerSchema,
  generateAiAnswerSchema,
  questionIdSchema,
  questionVersionSchema,
  voteTargetSchema,
  voteSchema,
  updateQuestionSettingsSchema,
} from "../validations/question.schema.js";
import {
  acceptAnswerLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createFeedbackOnAiAnswerLimiterMiddleware,
  createQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  deleteContentLimiterMiddleware,
  editAiFeedbackLimiterMiddleware,
  editQuestionLimiterMiddleware,
  generateSuggestionLimiterMiddleware,
  generateAiAnswerLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
  unmarkAnswerAsBestLimiterMiddleware,
  unacceptAnswerLimiterMiddleware,
  unvoteLimiterMiddleware,
  updateQuestionSettingsLimiterMiddleware,
  voteLimiterMiddleware,
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
    validate("body", createQuestionSchema),
    createQuestion,
  );

router
  .route("/:questionId/answer")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createAnswerOnQuestionLimiterMiddleware,
    validate("params", questionIdSchema),
    validate("body", createAnswerOnQuestionSchema),
    createAnswerOnQuestion,
  );

router
  .route("/answer/:answerId/reply")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createReplyOnAnswerLimiterMiddleware,
    validate("params", answerIdSchema),
    validate("body", createReplyOnAnswerSchema),
    createReplyOnAnswer,
  );

router
  .route("/vote")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    voteLimiterMiddleware,
    validate("body", voteSchema),
    vote,
  );

router
  .route("/vote/:targetType/:targetId")
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unvoteLimiterMiddleware,
    validate("params", voteTargetSchema),
    unvote,
  );

router
  .route("/answer/:answerId/accept")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    acceptAnswerLimiterMiddleware,
    validate("params", answerIdSchema),
    acceptAnswer,
  )
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unacceptAnswerLimiterMiddleware,
    validate("params", answerIdSchema),
    unacceptAnswer,
  );

router
  .route("/answer/:answerId/best")
  .put(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    markAnswerAsBestLimiterMiddleware,
    validate("params", answerIdSchema),
    markAnswerAsBest,
  )
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    unmarkAnswerAsBestLimiterMiddleware,
    validate("params", answerIdSchema),
    unmarkAnswerAsBest,
  );

router
  .route("/:questionId")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    editQuestionLimiterMiddleware,
    validate("params", questionIdSchema),
    validate("body", editQuestionSchema),
    editQuestion,
  );

router
  .route("/:questionId/settings")
  .get(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate("params", questionIdSchema),
    getQuestionSettings,
  )
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    updateQuestionSettingsLimiterMiddleware,
    validate("params", questionIdSchema),
    validate("body", updateQuestionSettingsSchema),
    updateQuestionSettings,
  );

router
  .route("/:questionId/versions/:version/rollback")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    rollbackVersionLimiterMiddleware,
    validate("params", questionVersionSchema),
    rollbackVersion,
  );

router
  .route("/content/:targetType/:targetId")
  .delete(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    deleteContentLimiterMiddleware,
    validate("params", contentTargetSchema),
    deleteContent,
  );

router
  .route("/:questionId/versions/:version/ai/suggestion")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    generateSuggestionLimiterMiddleware,
    validate("params", questionVersionSchema),
    generateQuestionSuggestion,
  );

router
  .route("/:questionId/ai/answer")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    generateAiAnswerLimiterMiddleware,
    validate("params", questionIdSchema),
    validate("body", generateAiAnswerSchema),
    generateAiAnswer,
  );

router
  .route("/:questionId/ai/answer/retry")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    generateAiAnswerLimiterMiddleware,
    validate("params", questionIdSchema),
    validate("body", generateAiAnswerSchema),
    retryBlockedAiAnswerGeneration,
  );

router
  .route("/ai/answer/feedback/create")
  .post(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    createFeedbackOnAiAnswerLimiterMiddleware,
    validate("body", createFeedbackOnAiAnswerSchema),
    createFeedbackOnAiAnswer,
  );

router
  .route("/ai/answer/feedback/edit")
  .patch(
    isAuthenticated,
    isVerified,
    requireActiveUser,
    editAiFeedbackLimiterMiddleware,
    validate("body", editAiFeedbackSchema),
    editFeedbackOnAiAnswer,
  );

export default router;
