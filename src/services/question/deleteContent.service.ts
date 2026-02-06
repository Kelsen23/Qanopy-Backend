import HttpError from "../../utils/httpError.util.js";

import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import {
  clearAnswerCache,
  clearReplyCache,
} from "../../utils/clearCache.util.js";

import statsQueue from "../../queues/stats.queue.js";
import imageDeletionQueue from "../../queues/imageDeletion.queue.js";

type TargetType = "question" | "answer" | "reply";

const modelMap = {
  question: Question,
  answer: Answer,
  reply: Reply,
} as const;

const actionMap = {
  question: "DELETE_QUESTION",
  answer: "DELETE_ANSWER",
  reply: "DELETE_REPLY",
} as const;

const deleteContent = async (
  userId: string,
  targetType: string,
  targetId: string,
) => {
  const validTargetTypes: TargetType[] = ["question", "answer", "reply"];

  if (!validTargetTypes.includes(targetType as TargetType)) {
    throw new HttpError("Invalid target type", 400);
  }

  if (
    typeof targetId !== "string" ||
    !mongoose.Types.ObjectId.isValid(targetId)
  ) {
    throw new HttpError("Invalid targetId", 400);
  }

  const Model = modelMap[targetType as TargetType];
  let foundContent: any;

  if (targetType === "question") {
    const cachedQuestion = await getRedisCacheClient().get(
      `question:${targetId}`,
    );
    foundContent = cachedQuestion
      ? JSON.parse(cachedQuestion)
      : await Model.findById(targetId).lean();
  } else {
    foundContent = await Model.findById(targetId).lean();
  }

  if (!foundContent) {
    throw new HttpError(
      `${targetType.charAt(0).toUpperCase() + targetType.slice(1)} not found`,
      404,
    );
  }

  if (foundContent.userId?.toString() !== userId) {
    throw new HttpError(`Unauthorized to delete ${targetType}`, 403);
  }

  if (foundContent.isDeleted || !foundContent.isActive) {
    throw new HttpError(`${targetType} not active`, 410);
  }

  await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
    $set: { isDeleted: true, isActive: false },
  });

  if (targetType === "question") {
    await statsQueue.add("deleteQuestion", {
      userId,
      action: actionMap.question,
    });
    await imageDeletionQueue.add("deleteFromBody", {
      body: foundContent.body,
      entityType: targetType,
      entityId: targetId,
    });

    await getRedisCacheClient().del(`question:${targetId}`);
  } else if (targetType === "answer") {
    await statsQueue.add("deleteAnswer", {
      userId,
      action: actionMap.answer,
      mongoTargetId: foundContent.questionId as string,
    });
    await imageDeletionQueue.add("deleteFromBody", {
      body: foundContent.body,
      entityType: targetType,
      entityId: targetId,
    });

    await getRedisCacheClient().del(`question:${foundContent.questionId}`);
    await clearAnswerCache(foundContent.questionId as string);
  } else if (targetType === "reply") {
    const foundAnswer = await Answer.findById(foundContent.answerId).lean();

    if (!foundAnswer) {
      throw new HttpError("Parent answer not found", 404);
    }

    await statsQueue.add("deleteReply", {
      action: actionMap.reply,
      mongoTargetId: foundAnswer._id,
    });

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);
    await clearReplyCache(foundAnswer._id as string);
  }

  return {
    message: `Successfully deleted ${targetType}`,
  };
};

export default deleteContent;
