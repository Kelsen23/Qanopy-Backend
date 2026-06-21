import { getRedisCacheClient } from "../../config/redis.config.js";

import Answer from "../../models/answer.model.js";
import AiAnswer from "../../models/aiAnswer.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";
import Reply from "../../models/reply.model.js";

import {
  clearAiAnswerFeedbackCache,
  clearAnswerCache,
  clearReplyCache,
  clearVersionHistoryCache,
} from "../cache/clearCache.util.js";

type ModeratableContentType =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

const clearModeratedContentCache = async (
  contentType: ModeratableContentType,
  contentId: string,
  versionOrRevision?: number,
) => {
  if (contentType === "QUESTION") {
    if (versionOrRevision !== undefined) {
      await getRedisCacheClient().del(
        `question:${contentId}`,
        `v:${versionOrRevision}:question:${contentId}`,
      );
    } else {
      await getRedisCacheClient().del(`question:${contentId}`);
    }

    await clearVersionHistoryCache(contentId);
    return;
  }

  if (contentType === "ANSWER") {
    const foundAnswer = await Answer.findById(contentId)
      .select("questionId")
      .lean();

    if (!foundAnswer) return;

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(String(foundAnswer.questionId));
    return;
  }

  if (contentType === "REPLY") {
    const foundReply = await Reply.findById(contentId)
      .select("answerId")
      .lean();

    if (!foundReply) return;

    const foundAnswer = await Answer.findById(foundReply.answerId)
      .select("questionId")
      .lean();

    if (!foundAnswer) return;

    await getRedisCacheClient().del(`question:${foundAnswer.questionId}`);
    await clearAnswerCache(String(foundAnswer.questionId));
    await clearReplyCache(String(foundReply.answerId));
    return;
  }

  const foundFeedback = await AiAnswerFeedback.findById(contentId)
    .select("aiAnswerId")
    .lean();

  if (!foundFeedback) return;

  const foundAiAnswer = await AiAnswer.findById(foundFeedback.aiAnswerId)
    .select("questionId")
    .lean();

  if (!foundAiAnswer) return;

  await getRedisCacheClient().del(`question:${foundAiAnswer.questionId}`);
  await clearAiAnswerFeedbackCache(String(foundFeedback.aiAnswerId), contentId);
};

export default clearModeratedContentCache;
