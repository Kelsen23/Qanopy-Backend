import { getRedisCacheClient } from "../../../config/redis.config.js";

import {
  clearAiAnswerFeedbackCache,
  clearAnswerCache,
  clearReplyCache,
} from "../../../utils/cache/clearCache.util.js";
import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import AiAnswer from "../../../models/aiAnswer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import Answer from "../../../models/answer.model.js";
import Question from "../../../models/question.model.js";
import Reply from "../../../models/reply.model.js";

import imageDeletionQueue from "../../../queues/imageDeletion.queue.js";
import statsQueue from "../../../queues/stats.queue.js";

import { isObjectId } from "../question.shared.js";

type TargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

const modelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
  AI_ANSWER_FEEDBACK: AiAnswerFeedback,
} as const;

const actionMap = {
  QUESTION: "DELETE_QUESTION",
  ANSWER: "DELETE_ANSWER",
  REPLY: "DELETE_REPLY",
} as const;

const deleteContent = async (
  userId: string,
  targetType: string,
  targetId: string,
) => {
  const validTargetTypes: TargetType[] = [
    "QUESTION",
    "ANSWER",
    "REPLY",
    "AI_ANSWER_FEEDBACK",
  ];

  if (!validTargetTypes.includes(targetType as TargetType)) {
    throw new HttpError("Invalid target type", 400);
  }

  if (!isObjectId(targetId)) {
    throw new HttpError("Invalid targetId", 400);
  }

  const Model = modelMap[targetType as TargetType] as any;
  let foundContent: any;

  if (targetType === "QUESTION") {
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
    throw new HttpError(`${targetType} not found`, 404);
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

  if (targetType === "QUESTION") {
    await statsQueue.add(
      "DELETE_QUESTION",
      {
        userId,
        action: actionMap.QUESTION,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "deleteQuestion", targetId),
      },
    );
    await imageDeletionQueue.add(
      "DELETE_FROM_BODY",
      {
        body: foundContent.body,
        entityType: targetType,
        entityId: targetId,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "imageDeletion",
          "DELETE_FROM_BODY",
          targetType,
          targetId,
        ),
      },
    );

    await getRedisCacheClient().del(`question:${targetId}`);
  } else if (targetType === "ANSWER") {
    await statsQueue.add(
      "DELETE_ANSWER",
      {
        userId,
        action: actionMap.ANSWER,
        mongoTargetId: foundContent.questionId as string,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "deleteAnswer", targetId),
      },
    );
    await imageDeletionQueue.add(
      "DELETE_FROM_BODY",
      {
        body: foundContent.body,
        entityType: targetType,
        entityId: targetId,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "imageDeletion",
          "DELETE_FROM_BODY",
          targetType,
          targetId,
        ),
      },
    );

    await getRedisCacheClient().del(`question:${foundContent.questionId}`);
    await clearAnswerCache(foundContent.questionId as string);
  } else if (targetType === "REPLY") {
    const foundAnswer = await Answer.findById(foundContent.answerId).lean();

    if (!foundAnswer) {
      throw new HttpError("Parent answer not found", 404);
    }

    await statsQueue.add(
      "DELETE_REPLY",
      {
        action: actionMap.REPLY,
        mongoTargetId: foundAnswer._id,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("stats", "deleteReply", targetId),
      },
    );

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(foundAnswer.questionId as string);
    await clearReplyCache(foundAnswer._id as string);
  } else if (targetType === "AI_ANSWER_FEEDBACK") {
    const foundFeedback = await Model.findById(targetId)
      .select("_id userId aiAnswerId isDeleted isActive")
      .lean();

    if (!foundFeedback) {
      throw new HttpError("AI_ANSWER_FEEDBACK not found", 404);
    }

    if (foundFeedback.userId?.toString() !== userId) {
      throw new HttpError("Unauthorized to delete AI_ANSWER_FEEDBACK", 403);
    }

    if (foundFeedback.isDeleted || !foundFeedback.isActive) {
      throw new HttpError("AI_ANSWER_FEEDBACK not active", 410);
    }

    await Model.findByIdAndUpdate(foundFeedback._id || foundFeedback.id, {
      $set: { isDeleted: true, isActive: false },
    });

    await clearAiAnswerFeedbackCache(
      String(foundFeedback.aiAnswerId),
      String(foundFeedback._id || foundFeedback.id),
    );

    const foundAiAnswer = await AiAnswer.findById(foundFeedback.aiAnswerId)
      .select("questionId")
      .lean();

    if (foundAiAnswer) {
      await getRedisCacheClient().del(`question:${foundAiAnswer.questionId}`);
    }
  }

  return {
    message: `Successfully deleted ${targetType}`,
  };
};

export default deleteContent;
