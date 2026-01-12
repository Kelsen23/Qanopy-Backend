import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisMessagingClient } from "../../config/redis.config.js";

import createRateLimiterMiddleware from "../createRateLimiter.middleware.js";

const createQuestionLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "createQuestion",
  points: 8,
  duration: 60 * 30,
});

const createAnswerOnQuestionLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "createAnswerOnQuestion",
  points: 3,
  duration: 60 * 30,
});

const createReplyOnAnswerLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "createReplyOnAnswer",
  points: 5,
  duration: 60 * 15,
});

const voteLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "vote",
  points: 20,
  duration: 60 * 15,
});

const acceptAnswerLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "acceptAnswer",
  points: 10,
  duration: 60 * 30,
});

const markAnswerAsBestLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "markAnswerAsBest",
  points: 5,
  duration: 60 * 30,
});

const editQuestionLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "editQuestion",
  points: 5,
  duration: 60 * 30,
});

const rollbackVersionLimiter = new RateLimiterRedis({
  storeClient: redisMessagingClient,
  keyPrefix: "rollbackVersion",
  points: 3,
  duration: 60 * 30,
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

export {
  createQuestionLimiterMiddleware,
  createAnswerOnQuestionLimiterMiddleware,
  createReplyOnAnswerLimiterMiddleware,
  voteLimiterMiddleware,
  acceptAnswerLimiterMiddleware,
  markAnswerAsBestLimiterMiddleware,
  editQuestionLimiterMiddleware,
  rollbackVersionLimiterMiddleware,
};
