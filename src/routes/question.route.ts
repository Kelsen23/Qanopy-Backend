import express from "express";

import {
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
  validateContentImage,
} from "../controllers/question.controller.js";

import {
  createQuestionSchema,
  createAnswerOnQuestionSchema,
  createReplyOnAnswerSchema,
  voteSchema,
  validateContentImageSchema,
} from "../validations/question.schema.js";

import {
  createQuestionLimiterMiddleware,
  editQuestionLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  voteLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
  validateContentImageMiddleware,
} from "../middlewares/rate-limiters/question.rate-limiters.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/auth.middleware.js";

import validate from "../middlewares/validate.middleware.js";

const router = express.Router();

router
  .route("/create")
  .post(
    createQuestionLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(createQuestionSchema),
    createQuestion,
  );

router
  .route("/create/:questionId/answer")
  .post(
    createAnswerOnQuestionLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(createAnswerOnQuestionSchema),
    createAnswerOnQuestion,
  );

router
  .route("/create/:answerId/reply")
  .post(
    createReplyOnAnswerLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(createReplyOnAnswerSchema),
    createReplyOnAnswer,
  );

router
  .route("/vote")
  .post(
    voteLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(voteSchema),
    vote,
  );

router
  .route("/unvote/:targetType/:targetId")
  .delete(isAuthenticated, isVerified, requireActiveUser, unvote);

router
  .route("/answer/:answerId/accept")
  .patch(isAuthenticated, isVerified, requireActiveUser, acceptAnswer);

router
  .route("/answer/:answerId/unaccept")
  .patch(isAuthenticated, isVerified, requireActiveUser, unacceptAnswer);

router
  .route("/answer/:answerId/mark/asBest")
  .patch(
    markAnswerAsBestLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    markAnswerAsBest,
  );

router
  .route("/answer/:answerId/unmark/asBest")
  .patch(isAuthenticated, isVerified, requireActiveUser, unmarkAnswerAsBest);

router
  .route("/:questionId/edit")
  .patch(
    editQuestionLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(createQuestionSchema),
    editQuestion,
  );

router
  .route("/:questionId/versions/:version/rollback")
  .post(
    rollbackVersionLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    rollbackVersion,
  );

router
  .route("/:targetType/:targetId")
  .delete(isAuthenticated, isVerified, requireActiveUser, deleteContent);

router
  .route("/content/validate/image")
  .post(
    validateContentImageMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(validateContentImageSchema),
    validateContentImage,
  );

export default router;
