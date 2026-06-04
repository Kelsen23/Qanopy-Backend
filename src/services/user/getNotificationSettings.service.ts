import prisma from "../../config/prisma.config.js";

interface GetNotificationSettingsInput {
  userId: string;
}

const getNotificationSettings = async ({
  userId,
}: GetNotificationSettingsInput) => {
  const settings = await prisma.notificationSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return { settings };
};

export default getNotificationSettings;
