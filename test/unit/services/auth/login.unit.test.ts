import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  seedBcryptCompareResult,
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
vi.mock("bcrypt", () => mockAuthUnitModules.bcrypt);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const { default: login } = await import(
  "../../../../src/services/auth/login.service.js"
);

describe("login service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);

    await expect(
      login({ email: "alice@example.com", password: "Password1!" }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 400,
    });
  });

  it("rejects users without passwords", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      password: null,
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
    });

    await expect(
      login({ email: "alice@example.com", password: "Password1!" }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 400,
    });
  });

  it("rejects expired unverified users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      password: "hashed",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date("2020-01-01"),
    });
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(true);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      true,
    );

    await expect(
      login({ email: "alice@example.com", password: "Password1!" }),
    ).rejects.toMatchObject({
      message: "Email verification expired, please sign up again",
      statusCode: 410,
    });
  });

  it("rejects wrong passwords", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      password: "hashed:real-password",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
    });
    seedBcryptCompareResult("Password1!", "hashed:real-password", false);

    await expect(
      login({ email: "alice@example.com", password: "Password1!" }),
    ).rejects.toMatchObject({
      message: "Invalid password",
      statusCode: 401,
    });
  });

  it("caches the user after a successful login", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      password: "hashed:real-password",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      tokenVersion: 2,
      status: "ACTIVE",
      role: "USER",
      isDeleted: false,
    });
    seedBcryptCompareResult("Password1!", "hashed:real-password", true);

    const result = await login({
      email: "alice@example.com",
      password: "Password1!",
    });

    expect(result.user.email).toBe("alice@example.com");
    expect(authUnitTestEnvironment.redisStore.get("user:user_1")).toBeTruthy();
  });
});
