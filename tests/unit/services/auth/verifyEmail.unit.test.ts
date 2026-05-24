import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
  seedBcryptCompareResult,
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
vi.mock("bcrypt", () => mockAuthUnitModules.bcrypt);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const { default: verifyEmail } = await import(
  "../../../../src/services/auth/verifyEmail.service.js"
);

describe("verifyEmail service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      verifyEmail({ userId: "user_1", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects non-local users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "GOOGLE",
      isVerified: false,
      createdAt: new Date(),
      otp: "hashed",
      otpExpireAt: new Date(Date.now() + 10_000),
      otpResendAvailableAt: new Date(Date.now() + 10_000),
    });

    await expect(
      verifyEmail({ userId: "user_1", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Email verification not applicable",
      statusCode: 400,
    });
  });

  it("rejects invalid otp and increments attempts", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date(),
      otp: "hashed-otp",
      otpExpireAt: new Date(Date.now() + 10_000),
      otpResendAvailableAt: new Date(Date.now() + 10_000),
    });
    seedBcryptCompareResult("123456", "hashed-otp", false);

    await expect(
      verifyEmail({ userId: "user_1", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Invalid OTP",
      statusCode: 400,
    });

    expect(authUnitTestEnvironment.redisMultiChain.incr).toHaveBeenCalledWith(
      "auth:verify-email:attempts:user_1",
    );
  });

  it("locks out after too many invalid attempts", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date(),
      otp: "hashed-otp",
      otpExpireAt: new Date(Date.now() + 10_000),
      otpResendAvailableAt: new Date(Date.now() + 10_000),
    });
    authUnitTestEnvironment.redisGet.mockResolvedValue("5");

    await expect(
      verifyEmail({ userId: "user_1", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Too many invalid attempts, OTP locked",
      statusCode: 400,
    });
  });

  it("verifies and clears otp state", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date(),
      otp: "hashed-otp",
      otpExpireAt: new Date(Date.now() + 10_000),
      otpResendAvailableAt: new Date(Date.now() + 10_000),
    });
    seedBcryptCompareResult("123456", "hashed-otp", true);
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      status: "ACTIVE",
      isDeleted: false,
    });

    const result = await verifyEmail({ userId: "user_1", otp: "123456" });

    expect(result.user.isVerified).toBe(true);
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:user:user_1",
    );
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:verify-email:attempts:user_1",
    );
  });
});
