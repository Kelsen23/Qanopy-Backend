import prisma from "../../config/prisma.config.js";

interface UpdateNotificationSettingsInput {
  userId: string;
  settings: {
    upvote: boolean;
    downvote: boolean;
    answerCreated: boolean;
    replyCreated: boolean;
    answerAccepted: boolean;
    answerMarkedBest: boolean;
    aiSuggestionUnlocked: boolean;
    aiAnswerUnlocked: boolean;
    similarQuestionsReady: boolean;
  };
}

const updateNotificationSettings = async ({
  userId,
  settings,
}: UpdateNotificationSettingsInput) => {
  const updatedSettings = await prisma.notificationSettings.upsert({
    where: { userId },
    update: {
      ...settings,
    },
    create: {
      userId,
      ...settings,
    },
  });

  return { settings: updatedSettings };
};

export default updateNotificationSettings;
