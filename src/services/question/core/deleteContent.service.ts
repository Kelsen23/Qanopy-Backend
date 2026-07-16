import { getRedisCacheClient } from "../../../config/redis.config.js";

import {
  clearAiAnswerFeedbackCache,
  clearAnswerCache,
  clearQuestionDiscoveryCache,
  clearReplyCache,
} from "../../../utils/cache/clearCache.util.js";
import { getContentTypeLabel } from "../../../utils/content/contentTypeLabel.util.js";
import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import AiAnswer from "../../../models/aiAnswer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import Answer from "../../../models/answer.model.js";
import Question from "../../../models/question.model.js";
import Reply from "../../../models/reply.model.js";

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
    throw new HttpError(`${getContentTypeLabel(targetType)} not found`, 404);
  }

  if (foundContent.userId?.toString() !== userId) {
    throw new HttpError(
      `Unauthorized to delete ${getContentTypeLabel(targetType)}`,
      403,
    );
  }

  if (foundContent.isDeleted || !foundContent.isActive) {
    throw new HttpError(`${getContentTypeLabel(targetType)} not active`, 410);
  }

  if (targetType === "QUESTION") {
    await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
      $set: { isDeleted: true, isActive: false },
    });

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
    await getRedisCacheClient().del(`question:${targetId}`);
    await clearQuestionDiscoveryCache();
  } else if (targetType === "ANSWER") {
    await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
      $set: { isDeleted: true, isActive: false },
    });

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
    await getRedisCacheClient().del(`question:${foundContent.questionId}`);
    await clearAnswerCache(foundContent.questionId as string);
    await clearQuestionDiscoveryCache();
  } else if (targetType === "REPLY") {
    await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
      $set: { isDeleted: true, isActive: false },
    });

    const foundAnswer = await Answer.findById(foundContent.answerId).lean();

    if (!foundAnswer) {
      throw new HttpError("Parent answer not found", 404);
    }

    await statsQueue.add(
      "DELETE_REPLY",
      {
        userId: foundContent.userId as string,
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
    await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
      $set: { isDeleted: true, isActive: false },
    });

    await clearAiAnswerFeedbackCache(
      String(foundContent.aiAnswerId),
      String(foundContent._id || foundContent.id),
    );

    const foundAiAnswer = await AiAnswer.findById(foundContent.aiAnswerId)
      .select("questionId")
      .lean();

    if (foundAiAnswer) {
      await getRedisCacheClient().del(`question:${foundAiAnswer.questionId}`);
    }
  }

  return {
    message: `Successfully deleted ${getContentTypeLabel(targetType)}`,
  };
};

export default deleteContent;
