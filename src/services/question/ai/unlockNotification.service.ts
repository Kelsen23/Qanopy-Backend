import routeNotification from "../../notification/routeNotification.service.js";

const queueAiSuggestionUnlockedNotification = async ({
  questionId,
  version,
  userId,
}: {
  questionId: string;
  version: number;
  userId: string;
}) =>
  routeNotification({
    recipientId: userId,
    event: "AI_SUGGESTION_UNLOCKED",
    target: {
      entityType: "QUESTION",
      entityId: questionId,
      questionVersion: version,
    },
    meta: {
      questionId,
      questionVersion: version,
    },
  });

const queueAiAnswerUnlockedNotification = async ({
  questionId,
  version,
  userId,
}: {
  questionId: string;
  version: number;
  userId: string;
}) =>
  routeNotification({
    recipientId: userId,
    event: "AI_ANSWER_UNLOCKED",
    target: {
      entityType: "QUESTION",
      entityId: questionId,
      questionVersion: version,
    },
    meta: {
      questionId,
      questionVersion: version,
    },
  });

export {
  queueAiAnswerUnlockedNotification,
  queueAiSuggestionUnlockedNotification,
};
