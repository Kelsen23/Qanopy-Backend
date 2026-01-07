import express from "express";

import {
  createQuestion,
  createAnswerOnQuestion,
  createReplyOnAnswer,
  vote,
  unvote,
  acceptAnswer,
  markAnswerAsBest,
  unmarkAnswerAsBest,
  deleteContent,
} from "../controllers/questionController.js";

import {
  createQuestionSchema,
  createAnswerOnQuestionSchema,
  createReplyOnAnswerSchema,
  voteSchema,
} from "../validations/question.schema.js";

import {
  createQuestionLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  voteLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
} from "../middlewares/rateLimiters/questionRateLimiters.js";

import isAuthenticated, {
  requireActiveUser,
  isVerified,
} from "../middlewares/authMiddleware.js";

import validate from "../middlewares/validateMiddleware.js";

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
  .route("/create/answer/:questionId")
  .post(
    createAnswerOnQuestionLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    validate(createAnswerOnQuestionSchema),
    createAnswerOnQuestion,
  );

router
  .route("/create/reply/:answerId")
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
  .route("/answer/markAsBest/:answerId")
  .patch(
    markAnswerAsBestLimiterMiddleware,
    isAuthenticated,
    isVerified,
    requireActiveUser,
    markAnswerAsBest,
  );

router
  .route("/answer/unmarkAsBest/:answerId")
  .patch(isAuthenticated, isVerified, requireActiveUser, unmarkAnswerAsBest);

router
  .route("/:targetType/:targetId")
  .delete(isAuthenticated, isVerified, requireActiveUser, deleteContent);

export default router;
