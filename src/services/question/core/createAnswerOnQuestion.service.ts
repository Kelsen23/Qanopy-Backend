import routeNotification from "../../notification/routeNotification.service.js";
import queueUserInterest from "../../user/userInterest/queueUserInterest.service.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";

import contentFinalizeQueue from "../../../queues/contentFinalize.queue.js";

import {
  clearQuestionThreadCache,
  ensureActiveQuestion,
  getCachedQuestion,
  isObjectId,
  queueQuestionStats,
} from "../question.shared.js";
import { toPublicAnswer } from "../question.response.js";

const createAnswerOnQuestion = async ({
  userId,
  questionId,
  body,
}: {
  userId: string;
  questionId: string;
  body: string;
}) => {
  if (!isObjectId(questionId)) throw new HttpError("Invalid questionId", 400);

  const foundQuestion =
    (await getCachedQuestion(
      questionId,
      "_id userId isActive isDeleted currentVersion tags",
    )) ??
    (await Question.findById(questionId)
      .select("_id userId isActive isDeleted currentVersion tags")
      .lean());

  ensureActiveQuestion(foundQuestion);

  const newAnswer = await Answer.create({
    questionId,
    body,
    userId,
    questionVersion: foundQuestion.currentVersion,
  });

  await clearQuestionThreadCache(questionId);

  await queueQuestionStats({
    name: "GIVE_ANSWER",
    action: "GIVE_ANSWER",
    userId,
    mongoTargetId: String(foundQuestion._id || questionId),
    jobIdParts: ["giveAnswer", String(newAnswer._id)],
  });

  await contentFinalizeQueue.add(
    "ANSWER",
    {
      userId,
      entityId: String(newAnswer._id),
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentFinalize", "ANSWER", String(newAnswer._id)),
    },
  );

  if (foundQuestion.userId?.toString() !== userId) {
    await routeNotification({
      recipientId: foundQuestion.userId as string,
      actorId: userId,
      event: "ANSWER_CREATED",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
      },
      meta: {
        answerId: String(newAnswer._id),
      },
    });
  }

  if (foundQuestion.tags?.length) {
    queueUserInterest({
      userId,
      tags: foundQuestion.tags as string[],
      action: "ANSWER",
    }).catch(() => {});
  }

  return {
    message: "Successfully created answer",
    answer: toPublicAnswer(newAnswer),
  };
};

export default createAnswerOnQuestion;
