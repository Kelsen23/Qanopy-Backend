import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  resetUserUnitTestEnvironment,
  seedRedisValue,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockUserUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/utils/cache/clearCache.util.js",
  () => mockUserUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockUserUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/auth/buildDeletedUserData.util.js",
  () => mockUserUnitModules.buildDeletedUserData,
);
vi.mock(
  "../../../../src/utils/socket/publishSocketDisconnect.util.js",
  () => mockUserUnitModules.publishSocketDisconnect,
);
vi.mock(
  "../../../../src/queues/accountDeletion.queue.js",
  () => mockUserUnitModules.accountDeletionQueue,
);

const { default: updateProfile } = await import(
  "../../../../src/services/user/updateProfile.service.js"
);
const { default: deleteAccount } = await import(
  "../../../../src/services/user/deleteAccount.service.js"
);

const makeFullUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "user_1",
    username: "alice",
    email: "alice@example.com",
    password: "hashed-password",
    tokenVersion: 2,
    registeredStage: "beta",
    otp: null,
    otpResendAvailableAt: null,
    otpExpireAt: null,
    resetPasswordOtp: null,
    resetPasswordOtpVerified: null,
    resetPasswordOtpResendAvailableAt: null,
    resetPasswordOtpExpireAt: null,
    emailChangePendingEmail: null,
    emailChangeOtp: null,
    emailChangeOtpResendAvailableAt: null,
    emailChangeOtpExpireAt: null,
    deletedAt: null,
    accountDeletionRequestedAt: null,
    accountDeletionCompletedAt: null,
    displayName: "Alice",
    bio: "bio",
    role: "USER",
    auth: {
      password: "hashed-password",
      tokenVersion: 2,
      authProvider: "LOCAL",
      isVerified: true,
      otp: null,
      otpResendAvailableAt: null,
      otpExpireAt: null,
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
    },
    profile: {
      displayName: "Alice",
      bio: "bio",
      profilePictureUrl: null,
      profilePictureKey: null,
    },
    stats: {
      reputationPoints: 0,
      questionsAsked: 0,
      answersGiven: 0,
      acceptedAnswers: 0,
      bestAnswers: 0,
      registeredStage: "beta",
    },
    statusState: {
      status: "ACTIVE",
      isDeleted: false,
      deletedAt: null,
      accountDeletionRequestedAt: null,
      accountDeletionCompletedAt: null,
    },
    emailChange: {
      pendingEmail: null,
      otp: null,
      otpResendAvailableAt: null,
      otpExpireAt: null,
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }) as any;

describe("user account and profile services", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  it("loads users from redis cache before falling back to prisma", async () => {
    seedRedisValue(
      "user:user_1",
      makeFullUser({
        profile: {
          displayName: "Old Name",
          bio: "bio",
          profilePictureUrl: null,
          profilePictureKey: null,
        },
      }),
    );
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue(
      makeFullUser({
        profile: {
          displayName: "New Name",
          bio: "bio",
          profilePictureUrl: null,
          profilePictureKey: null,
        },
      }),
    );
    userUnitTestEnvironment.prismaUserFindUniqueOrThrow.mockResolvedValue(
      makeFullUser({
        profile: {
          displayName: "New Name",
          bio: "bio",
          profilePictureUrl: null,
          profilePictureKey: null,
        },
      }),
    );

    const result = await updateProfile({
      userId: "user_1",
      displayName: "New Name",
    });

    expect(userUnitTestEnvironment.prismaUserFindUnique).not.toHaveBeenCalled();
    expect(result.user.profile.displayName).toBe("New Name");
    expect(result.user).not.toHaveProperty("password");
    expect(userUnitTestEnvironment.redisSet).toHaveBeenCalledWith(
      "user:user_1",
      expect.any(String),
      "EX",
      1200,
    );
  });

  it("rejects missing users during profile updates", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      updateProfile({ userId: "user_1", displayName: "Alice" }),
    ).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });
  });

  it("rejects no-op profile updates", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeFullUser({ displayName: "Alice", bio: "bio" }),
    );

    await expect(
      updateProfile({ userId: "user_1", displayName: "Alice", bio: "bio" }),
    ).rejects.toMatchObject({
      message: "Profile already up to date",
      statusCode: 400,
    });
  });

  it("rejects missing users during account deletion", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(deleteAccount({ userId: "user_1" })).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });
  });

  it("rejects already completed account deletions", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      statusState: {
        isDeleted: true,
        accountDeletionCompletedAt: new Date(),
      },
      profile: { profilePictureKey: null },
    });

    await expect(deleteAccount({ userId: "user_1" })).rejects.toMatchObject({
      message: "User already deleted",
      statusCode: 409,
    });
  });

  it("only fills a missing deletion request timestamp for soft-deleted users", async () => {
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        tokenVersion: 2,
        statusState: {
          status: "DELETED",
          isDeleted: true,
          accountDeletionRequestedAt: null,
          accountDeletionCompletedAt: null,
          deletedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
        profile: { profilePictureKey: "profilePictures/avatar.png" },
      })
      .mockResolvedValueOnce(null);
    userUnitTestEnvironment.prismaUserFindUniqueOrThrow.mockResolvedValue(
      makeFullUser({ status: "DELETED", isDeleted: true }),
    );

    const result = await deleteAccount({ userId: "user_1" });

    expect(userUnitTestEnvironment.prismaUserStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          accountDeletionRequestedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      }),
    );
    expect(result).toEqual({ message: "Account deletion submitted" });
  });

  it("builds deleted user data, clears caches, disconnects sockets, and enqueues deletion for active users", async () => {
    userUnitTestEnvironment.prismaUserFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        tokenVersion: 2,
        statusState: {
          status: "ACTIVE",
          isDeleted: false,
          accountDeletionRequestedAt: null,
          accountDeletionCompletedAt: null,
          deletedAt: null,
        },
        profile: { profilePictureKey: "profilePictures/avatar.png" },
      })
      .mockResolvedValueOnce(null);
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue(
      makeFullUser({
        status: "DELETED",
        isDeleted: true,
        deletedAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
    );
    userUnitTestEnvironment.prismaUserFindUniqueOrThrow.mockResolvedValue(
      makeFullUser({
        status: "DELETED",
        isDeleted: true,
        deletedAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
    );

    await deleteAccount({ userId: "user_1" });

    expect(userUnitTestEnvironment.buildDeletedUserData).toHaveBeenCalled();
    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:user:user_1",
    );
    expect(userUnitTestEnvironment.clearNotificationCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(userUnitTestEnvironment.clearUserBadgesCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(
      userUnitTestEnvironment.publishSocketDisconnect,
    ).toHaveBeenCalledWith("user_1");
    expect(
      userUnitTestEnvironment.accountDeletionQueueAdd,
    ).toHaveBeenCalledWith(
      "DELETE_ACCOUNT",
      {
        userId: "user_1",
        profilePictureKey: "profilePictures/avatar.png",
      },
      expect.objectContaining({
        jobId: "accountDeletion__DELETE_ACCOUNT__user_1",
      }),
    );
  });
});
