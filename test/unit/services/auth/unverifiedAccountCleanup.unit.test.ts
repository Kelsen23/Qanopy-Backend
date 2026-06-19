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
  "../../../../src/utils/socket/publishSocketDisconnect.util.js",
  () => mockAuthUnitModules.publishSocketDisconnect,
);
vi.mock("../../../../src/services/auth/deleteAccount.service.js", () => ({
  purgeAccountData: vi.fn(),
}));

const {
  isExpiredUnverifiedLocalUser,
  cleanupExpiredUnverifiedUserById,
  cleanupAllExpiredUnverifiedUsers,
} = await import(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js"
);

describe("unverifiedAccountCleanup service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
  });

  it("detects expired unverified local users", () => {
    expect(
      isExpiredUnverifiedLocalUser({
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        authProvider: "LOCAL",
        isVerified: false,
      }),
    ).toBe(true);
  });

  it("does not clean up users that are not expired", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: false,
      profilePictureKey: null,
    });

    await expect(cleanupExpiredUnverifiedUserById("user_1")).resolves.toBe(
      false,
    );
  });

  it("cleans up expired users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      authProvider: "LOCAL",
      isVerified: false,
      profilePictureKey: "profile-key",
    });
    authUnitTestEnvironment.prismaUserDeleteMany.mockResolvedValue({
      count: 1,
    });

    await expect(cleanupExpiredUnverifiedUserById("user_1")).resolves.toBe(
      true,
    );
    expect(
      authUnitTestEnvironment.publishSocketDisconnect,
    ).toHaveBeenCalledWith("user_1");
  });

  it("counts expired users in the bulk cleanup", async () => {
    authUnitTestEnvironment.prismaUserFindMany.mockResolvedValue([
      { id: "user_1" },
      { id: "user_2" },
    ]);
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      authProvider: "LOCAL",
      isVerified: false,
      profilePictureKey: null,
    });

    await expect(
      cleanupAllExpiredUnverifiedUsers(),
    ).resolves.toBeGreaterThanOrEqual(0);
  });
});
