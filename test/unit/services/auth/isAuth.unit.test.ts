import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  seedRedisValue,
  mockAuthUnitTestEnvironment as authUnitTestEnvironment,
} from "../../../helpers/mockAuthUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthUnitModules.redisConfig,
);

const { default: isAuth } = await import(
  "../../../../src/services/auth/isAuth.service.js"
);

describe("isAuth service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(isAuth({ userId: "user_1" })).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("loads from prisma on cache miss and re-caches the user", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });

    const result = await isAuth({ userId: "user_1" });

    expect(result.user.id).toBe("user_1");
    expect(authUnitTestEnvironment.redisStore.get("user:user_1")).toBeTruthy();
  });

  it("uses cached users on a cache hit", async () => {
    seedRedisValue("user:user_1", {
      id: "user_1",
      email: "alice@example.com",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });

    const result = await isAuth({ userId: "user_1" });

    expect(result.user.id).toBe("user_1");
    expect(authUnitTestEnvironment.prismaUserFindUnique).not.toHaveBeenCalled();
  });
});
