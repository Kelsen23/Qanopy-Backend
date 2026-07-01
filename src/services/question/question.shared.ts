import mongoose from "mongoose";

import routeNotification from "../notification/routeNotification.service.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import {
  clearAnswerCache,
  clearReplyCache,
} from "../../utils/cache/clearCache.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import { makeJobId } from "../../utils/job/makeJobId.util.js";

import Answer from "../../models/answer.model.js";
import Question from "../../models/question.model.js";
import Reply from "../../models/reply.model.js";

import statsQueue from "../../queues/stats.queue.js";

type QuestionTargetType = "QUESTION" | "ANSWER" | "REPLY";

const isObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

const getCachedQuestion = async (
  questionId: string,
  select?: string,
): Promise<any> => {
  const cachedQuestion = await getRedisCacheClient().get(
    `question:${questionId}`,
  );

  if (cachedQuestion) return JSON.parse(cachedQuestion);

  const query = Question.findById(questionId);

  if (select) query.select(select);

  return query.lean();
};

const getOwnedQuestion = async (
  userId: string,
  questionId: string,
  select?: string,
): Promise<any> => {
  const query = Question.findOne({ _id: questionId, userId });

  if (select) query.select(select);

  return query.lean();
};

const getCachedAnswer = async (
  answerId: string,
  select?: string,
): Promise<any> => {
  const query = Answer.findById(answerId);

  if (select) query.select(select);

  return query.lean();
};

const getCachedReply = async (
  replyId: string,
  select?: string,
): Promise<any> => {
  const query = Reply.findById(replyId);

  if (select) query.select(select);

  return query.lean();
};

const ensureActiveQuestion = (question: any) => {
  if (!question) throw new HttpError("Question not found", 404);
  if (question.isDeleted || !question.isActive)
    throw new HttpError("Question not active", 410);
};

const ensureActiveAnswer = (answer: any) => {
  if (!answer) throw new HttpError("Answer not found", 404);
  if (answer.isDeleted || !answer.isActive)
    throw new HttpError("Answer not active", 410);
};

const clearQuestionCache = async (questionId: string) => {
  await getRedisCacheClient().del(`question:${questionId}`);
};

const clearQuestionThreadCache = async (questionId: string) => {
  await Promise.all([
    clearQuestionCache(questionId),
    clearAnswerCache(questionId),
  ]);
};

const clearQuestionReplyCache = async (
  questionId: string,
  answerId: string,
) => {
  await Promise.all([
    clearQuestionThreadCache(questionId),
    clearReplyCache(answerId),
  ]);
};

const queueQuestionStats = async ({
  name,
  action,
  userId,
  mongoTargetId,
  eventId,
  jobIdParts,
}: {
  name: string;
  action: string;
  userId?: string;
  mongoTargetId?: string;
  eventId?: string;
  jobIdParts: Array<string | number | undefined | null>;
}) => {
  await statsQueue.add(
    name,
    {
      ...(userId ? { userId } : {}),
      action,
      ...(mongoTargetId ? { mongoTargetId } : {}),
      ...(eventId ? { eventId } : {}),
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("stats", ...jobIdParts),
    },
  );
};

const queueQuestionNotification = routeNotification;

const makeQuestionAnswerStateEventId = (
  action: string,
  questionId: string,
  answerId: string,
  state: string | Date | number,
) => makeJobId("questionAnswerState", action, questionId, answerId, state);

export type { QuestionTargetType };

export {
  isObjectId,
  getCachedQuestion,
  getOwnedQuestion,
  getCachedAnswer,
  getCachedReply,
  ensureActiveQuestion,
  ensureActiveAnswer,
  clearQuestionCache,
  clearQuestionThreadCache,
  clearQuestionReplyCache,
  queueQuestionStats,
  queueQuestionNotification,
  makeQuestionAnswerStateEventId,
};
