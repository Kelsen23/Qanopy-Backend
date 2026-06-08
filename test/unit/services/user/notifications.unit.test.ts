import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  resetUserUnitTestEnvironment,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockUserUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/utils/clearCache.util.js",
  () => mockUserUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/models/notification.model.js",
  () => mockUserUnitModules.notificationModel,
);

const { default: getNotificationSettings } = await import(
  "../../../../src/services/user/getNotificationSettings.service.js"
);
const { default: updateNotificationSettings } = await import(
  "../../../../src/services/user/updateNotificationSettings.service.js"
);
const { default: markNotificationsAsSeen } = await import(
  "../../../../src/services/user/markNotificationsAsSeen.service.js"
);

describe("user notification services", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  it("upserts notification settings on fetch", async () => {
    userUnitTestEnvironment.prismaNotificationSettingsUpsert.mockResolvedValue({
      userId: "user_1",
      upvote: true,
    });

    const result = await getNotificationSettings({ userId: "user_1" });

    expect(result).toEqual({
      settings: {
        userId: "user_1",
        upvote: true,
      },
    });
  });

  it("upserts updated notification settings", async () => {
    const settings = {
      upvote: true,
      downvote: false,
      answerCreated: true,
      replyCreated: true,
      answerAccepted: false,
      answerMarkedBest: false,
      aiSuggestionUnlocked: true,
      aiAnswerUnlocked: false,
      similarQuestionsReady: true,
    };
    userUnitTestEnvironment.prismaNotificationSettingsUpsert.mockResolvedValue({
      userId: "user_1",
      ...settings,
    });

    const result = await updateNotificationSettings({
      userId: "user_1",
      settings,
    });

    expect(
      userUnitTestEnvironment.prismaNotificationSettingsUpsert,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      update: settings,
      create: {
        userId: "user_1",
        ...settings,
      },
    });
    expect(result.settings.userId).toBe("user_1");
  });

  it("returns early when all notification ids are invalid", async () => {
    const result = await markNotificationsAsSeen({
      userId: "user_1",
      notificationIds: ["bad-id"],
    });

    expect(result).toEqual({ message: "No valid notification ids" });
    expect(
      userUnitTestEnvironment.notificationUpdateMany,
    ).not.toHaveBeenCalled();
  });

  it("updates only valid notification ids and clears the cache", async () => {
    await markNotificationsAsSeen({
      userId: "user_1",
      notificationIds: ["507f1f77bcf86cd799439011", "bad-id"],
    });

    expect(userUnitTestEnvironment.notificationUpdateMany).toHaveBeenCalledWith(
      {
        recipientId: "user_1",
        _id: { $in: ["507f1f77bcf86cd799439011"] },
        seen: false,
      },
      { $set: { seen: true } },
    );
    expect(userUnitTestEnvironment.clearNotificationCache).toHaveBeenCalledWith(
      "user_1",
    );
  });
});
