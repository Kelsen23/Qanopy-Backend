import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  mockAuthUnitTestEnvironment as authUnitTestEnvironment,
} from "../../../helpers/auth/mockAuthUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const {
  getDeviceIp,
  cacheUser,
  cacheAuthUser,
  removeResetPasswordAttempts,
  handleExpiredUnverifiedUser,
} = await import("../../../../src/services/auth/auth.shared.js");

describe("auth.shared", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockReset();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReset();
  });

  it("normalizes device IPs", () => {
    expect(
      getDeviceIp({ browser: "Chrome", os: "Linux", ip: "127.0.0.1" }),
    ).toBe("127.0.0.1");
    expect(
      getDeviceIp({ browser: "Chrome", os: "Linux", ip: ["1.1.1.1"] }),
    ).toBe("1.1.1.1");
    expect(getDeviceIp({ browser: "Chrome", os: "Linux" })).toBe("Unknown IP");
  });

  it("caches user records", async () => {
    await cacheUser({
      id: "user_1",
      email: "alice@example.com",
      password: "secret",
      tokenVersion: 1,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    } as any);

    expect(authUnitTestEnvironment.redisStore.get("user:user_1")).toContain(
      '"email":"alice@example.com"',
    );
  });

  it("caches auth user records", async () => {
    await cacheAuthUser({
      id: "user_1",
      tokenVersion: 1,
      status: "ACTIVE",
      isVerified: true,
      role: "ADMIN",
      isDeleted: false,
    } as any);

    expect(
      authUnitTestEnvironment.redisStore.get("auth:user:user_1"),
    ).toContain('"role":"ADMIN"');
  });

  it("removes reset password attempts", async () => {
    await removeResetPasswordAttempts("user_1");

    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:reset-password:attempts:user_1",
    );
  });

  it("only cleans up expired unverified users", async () => {
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(true);

    const cleaned = await handleExpiredUnverifiedUser({
      id: "user_1",
      createdAt: new Date("2020-01-01"),
      authProvider: "LOCAL",
      isVerified: false,
    } as any);

    expect(cleaned).toBe(true);
    expect(
      authUnitTestEnvironment.cleanupExpiredUnverifiedUserById,
    ).toHaveBeenCalledWith("user_1");
  });

  it("does not clean up verified users", async () => {
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);

    await expect(
      handleExpiredUnverifiedUser({
        id: "user_1",
        createdAt: new Date("2020-01-01"),
        authProvider: "LOCAL",
        isVerified: true,
      } as any),
    ).resolves.toBe(false);
  });
});
