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
  "../../../../src/utils/publishSocketDisconnect.util.js",
  () => mockAuthUnitModules.publishSocketDisconnect,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const { default: resetPassword } = await import(
  "../../../../src/services/auth/resetPassword.service.js"
);

describe("resetPassword service", () => {
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
      resetPassword({ email: "alice@example.com", newPassword: "Password2!" }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects when otp is not verified", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtpVerified: false,
    });

    await expect(
      resetPassword({ email: "alice@example.com", newPassword: "Password2!" }),
    ).rejects.toMatchObject({
      message: "OTP not verified",
      statusCode: 400,
    });
  });

  it("rejects reusing the same password", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtpVerified: true,
    });
    seedBcryptCompareResult("Password2!", "hashed:Password1!:10", true);

    await expect(
      resetPassword({ email: "alice@example.com", newPassword: "Password2!" }),
    ).rejects.toMatchObject({
      message: "New password must be different from the old password",
      statusCode: 400,
    });
  });

  it("updates the password, clears cache, and publishes socket disconnect", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      password: "hashed:Password1!:10",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtpVerified: true,
    });
    seedBcryptCompareResult("Password2!", "hashed:Password1!:10", false);
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      password: "hashed:Password2!:10",
    });

    const result = await resetPassword({
      email: "alice@example.com",
      newPassword: "Password2!",
    });

    expect(result.user.id).toBe("user_1");
    expect(
      authUnitTestEnvironment.publishSocketDisconnect,
    ).toHaveBeenCalledWith("user_1");
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "auth:user:user_1",
    );
    expect(authUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:user_1",
    );
  });
});
