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

const { default: verifyResetPasswordOtp } = await import(
  "../../../../src/services/auth/verifyResetPasswordOtp.service.js"
);

describe("verifyResetPasswordOtp service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);

    await expect(
      verifyResetPasswordOtp({ email: "alice@example.com", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects invalid otp and increments attempts", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-otp",
      resetPasswordOtpExpireAt: new Date(Date.now() + 10_000),
      resetPasswordOtpResendAvailableAt: new Date(Date.now() + 10_000),
    });
    seedBcryptCompareResult("123456", "hashed-otp", false);

    await expect(
      verifyResetPasswordOtp({ email: "alice@example.com", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Invalid reset password OTP",
      statusCode: 400,
    });
    expect(authUnitTestEnvironment.redisMultiChain.incr).toHaveBeenCalledWith(
      "auth:reset-password:attempts:user_1",
    );
  });

  it("rejects expired otp", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-otp",
      resetPasswordOtpExpireAt: new Date(Date.now() - 10_000),
      resetPasswordOtpResendAvailableAt: new Date(Date.now() + 10_000),
    });

    await expect(
      verifyResetPasswordOtp({ email: "alice@example.com", otp: "123456" }),
    ).rejects.toMatchObject({
      message: "Reset password OTP expired",
      statusCode: 400,
    });
  });

  it("marks otp as verified", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-otp",
      resetPasswordOtpExpireAt: new Date(Date.now() + 10_000),
      resetPasswordOtpResendAvailableAt: new Date(Date.now() + 10_000),
    });
    seedBcryptCompareResult("123456", "hashed-otp", true);
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
    });

    const result = await verifyResetPasswordOtp({
      email: "alice@example.com",
      otp: "123456",
    });

    expect(result).toEqual({ verified: true });
    expect(authUnitTestEnvironment.prismaUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({
        resetPasswordOtpVerified: true,
        resetPasswordOtp: null,
        resetPasswordOtpExpireAt: null,
        resetPasswordOtpResendAvailableAt: null,
      }),
    });
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:reset-password:attempts:user_1",
    );
  });
});
