import HttpError from "../../utils/http/httpError.util.js";
import { getRedisCacheClient } from "../../config/redis.config.js";
import {
  clearAnswerCache,
  clearReplyCache,
  clearVersionHistoryCache,
} from "../../utils/cache/clearCache.util.js";
import { getContentTypeLabel } from "../../utils/content/contentTypeLabel.util.js";
import { makeJobId } from "../../utils/job/makeJobId.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

import imageDeletionQueue from "../../queues/imageDeletion.queue.js";

type ModeratedTargetType =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

const modelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
  AI_ANSWER_FEEDBACK: AiAnswerFeedback,
} as const;

const removeModeratedContent = async (
  targetType: string,
  targetId: string,
  questionVersion?: number,
) => {
  const validTargetTypes: ModeratedTargetType[] = [
    "QUESTION",
    "ANSWER",
    "REPLY",
    "AI_ANSWER_FEEDBACK",
  ];

  if (!validTargetTypes.includes(targetType as ModeratedTargetType)) {
    throw new HttpError("Invalid target type", 400);
  }

  const Model = modelMap[targetType as ModeratedTargetType] as any;
  const foundContent = await Model.findById(targetId).lean();

  if (!foundContent) {
    throw new HttpError(`${getContentTypeLabel(targetType)} not found`, 404);
  }

  if (
    targetType === "QUESTION" &&
    typeof questionVersion === "number" &&
    Number(foundContent.currentVersion) !== questionVersion
  ) {
    await getRedisCacheClient().del(
      `v:${questionVersion}:question:${targetId}`,
    );
    await clearVersionHistoryCache(targetId);

    return {
      message: "Question version is no longer current, parent question left active",
      removed: false,
    };
  }

  if (!foundContent.isActive) {
    return {
      message: `${getContentTypeLabel(targetType)} already inactive`,
      removed: false,
    };
  }

  await Model.findByIdAndUpdate(foundContent._id || foundContent.id, {
    $set: { isActive: false },
  });

  if (typeof foundContent.body === "string" && foundContent.body.length > 0) {
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
  }

  if (targetType === "QUESTION") {
    await getRedisCacheClient().del(`question:${targetId}`);
    await clearVersionHistoryCache(targetId);
  } else if (targetType === "ANSWER") {
    await getRedisCacheClient().del(`question:${foundContent.questionId}`);
    await clearAnswerCache(String(foundContent.questionId));
  } else if (targetType === "REPLY") {
    const foundAnswer = await Answer.findById(foundContent.answerId)
      .select("questionId")
      .lean();

    if (foundAnswer) {
      await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
      await clearAnswerCache(String(foundAnswer.questionId));
      await clearReplyCache(String(foundContent.answerId));
    }
  }

  return {
    message: `Successfully removed moderated ${getContentTypeLabel(targetType)}`,
    removed: true,
  };
};

export default removeModeratedContent;
