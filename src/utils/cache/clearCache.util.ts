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

async function clearUserBadgesCache(userId: string) {
  await deleteKeysByPattern(`user:badges:${userId}:*`);
}

export {
  clearAnswerCache,
  clearUserBadgesCache,
  clearReplyCache,
  clearVersionHistoryCache,
  clearReportsCache,
  clearStrikesCache,
  clearNotificationCache,
  clearAiAnswerFeedbackCache,
};
