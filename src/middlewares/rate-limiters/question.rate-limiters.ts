import { RateLimiterRedis } from "rate-limiter-flexible";
import type { Request } from "express";

import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const userKeyResolver = (req: Request) =>
  (req as Request & { user?: { id?: string } }).user?.id || req.ip || "unknown";

const createQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:create",
  points: 12,
  duration: 60 * 60,
});

const createAnswerOnQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:answer:create",
  points: 24,
  duration: 60 * 60,
});

const createReplyOnAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:reply:create",
  points: 45,
  duration: 60 * 60,
});

const voteLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:vote",
  points: 180,
  duration: 60 * 15,
});

const unvoteLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:unvote",
  points: 180,
  duration: 60 * 15,
});

const acceptAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:answer:accept",
  points: 24,
  duration: 60 * 60,
});

const unacceptAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:answer:unaccept",
  points: 24,
  duration: 60 * 60,
});

const markAnswerAsBestLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:answer:best",
  points: 24,
  duration: 60 * 60,
});

const unmarkAnswerAsBestLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:answer:unbest",
  points: 24,
  duration: 60 * 60,
});

const editQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:edit",
  points: 12,
  duration: 60 * 60,
});

const rollbackVersionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:rollback",
  points: 6,
  duration: 60 * 60,
});

const deleteContentLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:delete",
  points: 10,
  duration: 60 * 60,
});

const generateSuggestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:suggestion",
  points: 12,
  duration: 60 * 30,
});

const generateAiAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:answer",
  points: 10,
  duration: 60 * 30,
});

const publishAiAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:answer:publish",
  points: 20,
  duration: 60 * 30,
});

const unpublishAiAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:answer:unpublish",
  points: 20,
  duration: 60 * 30,
});

const createFeedbackOnAiAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:feedback:create",
  points: 15,
  duration: 60 * 15,
});

const editAiFeedbackLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:feedback:edit",
  points: 15,
  duration: 60 * 15,
});

const deleteAiFeedbackLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "question:ai:feedback:delete",
  points: 15,
  duration: 60 * 15,
});

const createQuestionLimiterMiddleware = createRateLimiterMiddleware(
  createQuestionLimiter,
  "Too many questions created, please try again later",
  userKeyResolver,
);

const createAnswerOnQuestionLimiterMiddleware = createRateLimiterMiddleware(
  createAnswerOnQuestionLimiter,
  "Too many answers created, please try again later",
  userKeyResolver,
);

const createReplyOnAnswerLimiterMiddleware = createRateLimiterMiddleware(
  createReplyOnAnswerLimiter,
  "Too many replies created, please try again later",
  userKeyResolver,
);

const voteLimiterMiddleware = createRateLimiterMiddleware(
  voteLimiter,
  "Too many votes, please try again later",
  userKeyResolver,
);

const unvoteLimiterMiddleware = createRateLimiterMiddleware(
  unvoteLimiter,
  "Too many vote removals, please try again later",
  userKeyResolver,
);

const acceptAnswerLimiterMiddleware = createRateLimiterMiddleware(
  acceptAnswerLimiter,
  "Too many answer acceptance attempts, please try again later",
  userKeyResolver,
);

const unacceptAnswerLimiterMiddleware = createRateLimiterMiddleware(
  unacceptAnswerLimiter,
  "Too many answer unacceptance attempts, please try again later",
  userKeyResolver,
);

const markAnswerAsBestLimiterMiddleware = createRateLimiterMiddleware(
  markAnswerAsBestLimiter,
  "Too many best-answer updates, please try again later",
  userKeyResolver,
);

const unmarkAnswerAsBestLimiterMiddleware = createRateLimiterMiddleware(
  unmarkAnswerAsBestLimiter,
  "Too many best-answer updates, please try again later",
  userKeyResolver,
);

const editQuestionLimiterMiddleware = createRateLimiterMiddleware(
  editQuestionLimiter,
  "Too many edits, please try again later",
  userKeyResolver,
);

const rollbackVersionLimiterMiddleware = createRateLimiterMiddleware(
  rollbackVersionLimiter,
  "Too many rollbacks, please try again later",
  userKeyResolver,
);

const deleteContentLimiterMiddleware = createRateLimiterMiddleware(
  deleteContentLimiter,
  "Too many content deletions, please try again later",
  userKeyResolver,
);

const generateSuggestionLimiterMiddleware = createRateLimiterMiddleware(
  generateSuggestionLimiter,
  "Too many AI suggestions, please try again later",
  userKeyResolver,
);

const generateAiAnswerLimiterMiddleware = createRateLimiterMiddleware(
  generateAiAnswerLimiter,
  "Too many AI answer requests, please try again later",
  userKeyResolver,
);

const publishAiAnswerLimiterMiddleware = createRateLimiterMiddleware(
  publishAiAnswerLimiter,
  "Too many AI answer publish requests, please try again later",
  userKeyResolver,
);

const unpublishAiAnswerLimiterMiddleware = createRateLimiterMiddleware(
  unpublishAiAnswerLimiter,
  "Too many AI answer unpublish requests, please try again later",
  userKeyResolver,
);

const createFeedbackOnAiAnswerLimiterMiddleware = createRateLimiterMiddleware(
  createFeedbackOnAiAnswerLimiter,
  "Too many AI answer feedback requests, please try again later",
  userKeyResolver,
);

const editAiFeedbackLimiterMiddleware = createRateLimiterMiddleware(
  editAiFeedbackLimiter,
  "Too many AI answer feedback edit requests, please try again later",
  userKeyResolver,
);

const deleteAiFeedbackLimiterMiddleware = createRateLimiterMiddleware(
  deleteAiFeedbackLimiter,
  "Too many AI answer feedback delete requests, please try again later",
  userKeyResolver,
);

export {
  createQuestionLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  voteLimiterMiddleware,
  unvoteLimiterMiddleware,
  acceptAnswerLimiterMiddleware,
  unacceptAnswerLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  unmarkAnswerAsBestLimiterMiddleware,
  editQuestionLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
  deleteContentLimiterMiddleware,
  generateSuggestionLimiterMiddleware,
  generateAiAnswerLimiterMiddleware,
  publishAiAnswerLimiterMiddleware,
  unpublishAiAnswerLimiterMiddleware,
  createFeedbackOnAiAnswerLimiterMiddleware,
  editAiFeedbackLimiterMiddleware,
  deleteAiFeedbackLimiterMiddleware,
};
