import { getRedisCacheClient } from "../config/redis.config.js";

import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

import { clearAnswerCache, clearReplyCache } from "./clearCache.util.js";

async function invalidateCacheOnUnvote(
  targetType: "Question" | "Answer" | "Reply",
  targetId: string,
) {
  switch (targetType) {
    case "Question":
      await getRedisCacheClient().del(`question:${targetId}`);
      break;

    case "Answer": {
      const foundAnswer = await Answer.findById(targetId).select("questionId");
      if (!foundAnswer) return;

      const questionId = String(foundAnswer.questionId);
      await Promise.all([
        getRedisCacheClient().del(`question:${questionId}`),
        clearAnswerCache(questionId),
      ]);
      break;
    }

    case "Reply": {
      const foundReply = await Reply.findById(targetId).select("answerId");
      if (!foundReply) return;

      const foundAnswer = await Answer.findById(foundReply.answerId).select(
        "questionId",
      );
      if (!foundAnswer) return;

      const questionId = String(foundAnswer.questionId);
      const answerId = String(foundAnswer._id);

      await Promise.all([
        getRedisCacheClient().del(`question:${questionId}`),
        clearAnswerCache(questionId),
        clearReplyCache(answerId),
      ]);
      break;
    }
  }
}

export default invalidateCacheOnUnvote;
