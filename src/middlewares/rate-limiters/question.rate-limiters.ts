import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const createQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "createQuestion",
  points: 8,
  duration: 60 * 30,
});

const createAnswerOnQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "createAnswerOnQuestion",
  points: 3,
  duration: 60 * 30,
});

const createReplyOnAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "createReplyOnAnswer",
  points: 5,
  duration: 60 * 15,
});

const voteLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "vote",
  points: 20,
  duration: 60 * 15,
});

const acceptAnswerLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "acceptAnswer",
  points: 10,
  duration: 60 * 30,
});

const markAnswerAsBestLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "markAnswerAsBest",
  points: 5,
  duration: 60 * 30,
});

const editQuestionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "editQuestion",
  points: 5,
  duration: 60 * 30,
});

const rollbackVersionLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "rollbackVersion",
  points: 3,
  duration: 60 * 30,
});

const validateContentImageLimiter = new RateLimiterRedis({
  storeClient: getRedisMessagingClient(),
  keyPrefix: "validateContentImage",
  points: 15,
  duration: 60 * 60,
});

const createQuestionLimiterMiddleware = createRateLimiterMiddleware(
  createQuestionLimiter,
  "Too many questions created, try again after half an hour",
);

const createAnswerOnQuestionLimiterMiddleware = createRateLimiterMiddleware(
  createAnswerOnQuestionLimiter,
  "Too many answers created, try again after half an hour",
);

const createReplyOnAnswerLimiterMiddleware = createRateLimiterMiddleware(
  createReplyOnAnswerLimiter,
  "Too many replies created, try again after half 15 minutes",
);

const voteLimiterMiddleware = createRateLimiterMiddleware(
  voteLimiter,
  "Too many votes, try again after 15 minutes",
);

const acceptAnswerLimiterMiddleware = createRateLimiterMiddleware(
  acceptAnswerLimiter,
  "Too many answers accepted, try again after half an hour",
);

const markAnswerAsBestLimiterMiddleware = createRateLimiterMiddleware(
  markAnswerAsBestLimiter,
  "Too many answers marked, try again after half an hour",
);

const editQuestionLimiterMiddleware = createRateLimiterMiddleware(
  editQuestionLimiter,
  "Too many edits, try again later",
);

const rollbackVersionLimiterMiddleware = createRateLimiterMiddleware(
  rollbackVersionLimiter,
  "Too many rollbacks, try again later",
);

const validateContentImageMiddleware = createRateLimiterMiddleware(
  validateContentImageLimiter,
  "Too many image uploads, try again later",
);

export {
  createQuestionLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  voteLimiterMiddleware,
  acceptAnswerLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  editQuestionLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
  validateContentImageMiddleware,
};
