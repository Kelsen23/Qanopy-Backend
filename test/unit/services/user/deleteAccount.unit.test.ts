import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  mockAuthUnitTestEnvironment as authUnitTestEnvironment,
} from "../../../helpers/auth/mockAuthUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/models/notification.model.js",
  () => mockAuthUnitModules.notificationModel,
);
vi.mock(
  "../../../../src/models/userInterest.model.js",
  () => mockAuthUnitModules.userInterestModel,
);
vi.mock(
  "../../../../src/services/media/deleteSingleImage.service.js",
  () => mockAuthUnitModules.deleteSingleImageService,
);
vi.mock(
  "../../../../src/utils/auth/buildDeletedUserData.util.js",
  () => mockAuthUnitModules.buildDeletedUserData,
);
vi.mock(
  "../../../../src/utils/cache/clearCache.util.js",
  () => mockAuthUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/utils/cache/clearModerationCachesForUser.util.js",
  () => mockAuthUnitModules.clearModerationCacheUtil,
);

const {
  default: deleteAccount,
  purgeAccountData,
  softDeleteAccount,
} = await import(
  "../../../../src/services/user/processAccountDeletion.service.js"
);

describe("deleteAccount service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
  });

  it("purges account data", async () => {
    await purgeAccountData({
      userId: "user_1",
      profilePictureKey: "profile-key",
    });

    expect(
      authUnitTestEnvironment.deleteSingleImageService,
    ).toHaveBeenCalledWith({
      objectKey: "profile-key",
    });
    expect(authUnitTestEnvironment.clearNotificationCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(
      authUnitTestEnvironment.clearModerationCachesForUser,
    ).toHaveBeenCalledWith("user_1");
  });

  it("soft deletes accounts", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
      isDeleted: false,
      deletedAt: null,
      accountDeletionCompletedAt: null,
    });
    authUnitTestEnvironment.buildDeletedUserData.mockResolvedValue({
      status: "DELETED",
      isDeleted: true,
    });
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      accountDeletionCompletedAt: new Date(),
    });

    const result = await softDeleteAccount("user_1");

    expect(result?.id).toBe("user_1");
    expect(authUnitTestEnvironment.prismaUserUpdate).toHaveBeenCalled();
  });

  it("runs the full delete account flow", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
      isDeleted: false,
      deletedAt: null,
      accountDeletionCompletedAt: null,
    });
    authUnitTestEnvironment.buildDeletedUserData.mockResolvedValue({
      status: "DELETED",
      isDeleted: true,
    });
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      accountDeletionCompletedAt: new Date(),
    });

    await deleteAccount({
      userId: "user_1",
      profilePictureKey: "profile-key",
    });

    expect(authUnitTestEnvironment.clearNotificationCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(
      authUnitTestEnvironment.clearModerationCachesForUser,
    ).toHaveBeenCalledWith("user_1");
  });
});
