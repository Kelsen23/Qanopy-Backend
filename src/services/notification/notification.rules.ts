import prisma from "../../config/prisma.config.js";

type SettingsKey =
  | "upvote"
  | "downvote"
  | "answerCreated"
  | "replyCreated"
  | "answerAccepted"
  | "answerMarkedBest"
  | "aiSuggestionUnlocked"
  | "aiAnswerUnlocked"
  | "similarQuestionsReady";

type EventMapKey =
  | "UPVOTE"
  | "DOWNVOTE"
  | "ANSWER_CREATED"
  | "REPLY_CREATED"
  | "ANSWER_ACCEPTED"
  | "ANSWER_MARKED_BEST"
  | "AI_SUGGESTION_UNLOCKED"
  | "AI_ANSWER_UNLOCKED"
  | "SIMILAR_QUESTIONS_READY";

const eventMap: Record<EventMapKey, SettingsKey> = {
  UPVOTE: "upvote",
  DOWNVOTE: "downvote",
  ANSWER_CREATED: "answerCreated",
  REPLY_CREATED: "replyCreated",
  ANSWER_ACCEPTED: "answerAccepted",
  ANSWER_MARKED_BEST: "answerMarkedBest",
  AI_SUGGESTION_UNLOCKED: "aiSuggestionUnlocked",
  AI_ANSWER_UNLOCKED: "aiAnswerUnlocked",
  SIMILAR_QUESTIONS_READY: "similarQuestionsReady",
} as const;

const shouldNotify = async ({
  recipientId,
  actorId,
  event,
}: {
  recipientId: string;
  actorId?: string;
  event: EventMapKey;
}) => {
  if (recipientId === actorId) return false;

  const settings = await prisma.notificationSettings.findUnique({
    where: { userId: recipientId },
  });

  if (!settings) return true;

  const key = eventMap[event];

  return settings[key];
};

export default shouldNotify;
