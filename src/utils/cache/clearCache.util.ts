import { getRedisCacheClient } from "../../config/redis.config.js";

async function deleteKeysByPattern(pattern: string) {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await getRedisCacheClient().scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "100",
    );
    cursor = nextCursor;
    if (keys.length) await getRedisCacheClient().del(...keys);
  } while (cursor !== "0");
}

async function clearAnswerCache(questionId: string) {
  await deleteKeysByPattern(`answers:${questionId}*`);
}

async function clearReplyCache(answerId: string) {
  await deleteKeysByPattern(`replies:${answerId}*`);
}

async function clearVersionHistoryCache(questionId: string) {
  await deleteKeysByPattern(`v:question:${questionId}*`);
}

async function clearQuestionSearchCache() {
  await Promise.all([
    deleteKeysByPattern("recommendedQuestions:*"),
    deleteKeysByPattern("searchSuggestions:*"),
    deleteKeysByPattern("searchQuestions:*"),
  ]);
}

async function clearQuestionRankingCache() {
  await Promise.all([
    deleteKeysByPattern("recommendedQuestions:*"),
    deleteKeysByPattern("searchQuestions:*"),
    deleteKeysByPattern("questions:u:*"),
  ]);
}

async function clearQuestionAggregateCache() {
  await Promise.all([
    clearQuestionRankingCache(),
    deleteKeysByPattern("questions:recent:unanswered:u:*"),
    deleteKeysByPattern("questions:unanswered:u:*"),
  ]);
}

async function clearSimilarQuestionsCache(questionId?: string) {
  await deleteKeysByPattern(
    questionId ? `similarQuestions:${questionId}` : "similarQuestions:*",
  );
}

async function clearQuestionDiscoveryCache() {
  await Promise.all([
    clearQuestionSearchCache(),
    deleteKeysByPattern("questions:u:*"),
    deleteKeysByPattern("questions:recent:unanswered:u:*"),
    deleteKeysByPattern("questions:unanswered:u:*"),
    clearSimilarQuestionsCache(),
  ]);
}

async function clearReportsCache() {
  await deleteKeysByPattern("reports:*");
}

async function clearStrikesCache() {
  await deleteKeysByPattern("strikes:*");
}

async function clearNotificationCache(userId: string) {
  await deleteKeysByPattern(`notifications:${userId}:*`);
}

async function clearAiAnswerFeedbackCache(
  aiAnswerId: string,
  feedbackId?: string,
) {
  await deleteKeysByPattern(`aiAnswerFeedbacks:${aiAnswerId}:*`);

  if (feedbackId) {
    await deleteKeysByPattern(`aiAnswerFeedback:${feedbackId}`);
  }
}

async function clearAiAnswersCache(questionId: string) {
  await deleteKeysByPattern(`aiAnswers:${questionId}:*`);
}

async function clearUserBadgesCache(userId: string) {
  await deleteKeysByPattern(`user:badges:${userId}:*`);
}

export {
  clearAnswerCache,
  clearUserBadgesCache,
  clearReplyCache,
  clearVersionHistoryCache,
  clearQuestionSearchCache,
  clearQuestionRankingCache,
  clearQuestionAggregateCache,
  clearSimilarQuestionsCache,
  clearQuestionDiscoveryCache,
  clearReportsCache,
  clearStrikesCache,
  clearNotificationCache,
  clearAiAnswerFeedbackCache,
  clearAiAnswersCache,
};
