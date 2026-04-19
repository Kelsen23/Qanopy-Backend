import prisma from "../../config/prisma.config.js";

type SettingsKey =
  | "upvote"
  | "downvote"
  | "answerCreated"
  | "replyCreated"
  | "aiSuggestionUnlocked"
  | "aiAnswerUnlocked"
  | "similarQuestionsReady";

type EventMapKey =
  | "UPVOTE"
  | "DOWNVOTE"
  | "ANSWER_CREATED"
  | "REPLY_CREATED"
  | "AI_SUGGESTION_UNLOCKED"
  | "AI_ANSWER_UNLOCKED"
  | "SIMILAR_QUESTIONS_READY";

const eventMap: Record<EventMapKey, SettingsKey> = {
  UPVOTE: "upvote",
  DOWNVOTE: "downvote",
  ANSWER_CREATED: "answerCreated",
  REPLY_CREATED: "replyCreated",
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

  if (!settings) return false;

  const key = eventMap[event];

  return settings[key];
};

export default shouldNotify;
