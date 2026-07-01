import routeNotification from "../../notification/routeNotification.service.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";
import Reply from "../../../models/reply.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

import {
  clearQuestionReplyCache,
  ensureActiveAnswer,
  ensureActiveQuestion,
  getCachedAnswer,
  getCachedQuestion,
  isObjectId,
} from "../question.shared.js";
import { toPublicReply } from "../question.response.js";

const createReplyOnAnswer = async ({
  userId,
  answerId,
  body,
}: {
  userId: string;
  answerId: string;
  body: string;
}) => {
  if (!isObjectId(answerId)) throw new HttpError("Invalid answerId", 400);

  const foundAnswer =
    (await getCachedAnswer(
      answerId,
      "_id userId questionId isActive isDeleted",
    )) ??
    (await Answer.findById(answerId)
      .select("_id userId questionId isActive isDeleted")
      .lean());

  ensureActiveAnswer(foundAnswer);

  const foundQuestion =
    (await getCachedQuestion(
      foundAnswer.questionId as string,
      "_id userId isActive isDeleted",
    )) ??
    (await Question.findById(foundAnswer.questionId)
      .select("_id userId isActive isDeleted")
      .lean());

  ensureActiveQuestion(foundQuestion);

  const newReply = await Reply.create({ answerId, userId, body });

  await clearQuestionReplyCache(
    foundAnswer.questionId as string,
    String(foundAnswer._id || answerId),
  );

  await contentModerationQueue.add(
    "REPLY",
    {
      contentId: newReply._id,
      moderationRevision: newReply.moderationRevision,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentModeration", "REPLY", String(newReply._id)),
    },
  );

  if (foundAnswer.userId?.toString() !== userId) {
    await routeNotification({
      recipientId: foundAnswer.userId as string,
      actorId: userId,
      event: "REPLY_CREATED",
      target: {
        entityType: "ANSWER",
        entityId: answerId,
        parentId: foundAnswer.questionId as string,
      },
      meta: {
        replyId: String(newReply._id),
      },
    });
  }

  return {
    message: "Successfully created reply",
    reply: toPublicReply(newReply),
  };
};

export default createReplyOnAnswer;
