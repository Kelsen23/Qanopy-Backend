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
vi.mock("bcrypt", () => mockAuthUnitModules.bcrypt);
vi.mock(
  "../../../../src/queues/email.queue.js",
  () => mockAuthUnitModules.emailQueue,
);
vi.mock(
  "../../../../src/utils/makeJobId.util.js",
  () => mockAuthUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/renderTemplate.util.js",
  () => mockAuthUnitModules.renderTemplate,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const { default: resendResetPasswordEmail } = await import(
  "../../../../src/services/auth/resendResetPasswordEmail.service.js"
);

describe("resendResetPasswordEmail service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
    authUnitTestEnvironment.resetPasswordHtml.mockReturnValue(
      "<reset-password-email>",
    );
    authUnitTestEnvironment.makeUniqueJobId.mockReturnValue("job-id");
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);

    await expect(
      resendResetPasswordEmail({
        email: "alice@example.com",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects resend cooldown", async () => {
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

    await expect(
      resendResetPasswordEmail({
        email: "alice@example.com",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "OTP resend will soon be available, please wait",
      statusCode: 400,
    });
  });

  it("queues a resend reset password email", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-otp",
      resetPasswordOtpExpireAt: new Date(Date.now() - 1_000),
      resetPasswordOtpResendAvailableAt: new Date(Date.now() - 1_000),
    });
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-new-otp",
      resetPasswordOtpExpireAt: new Date(),
      resetPasswordOtpResendAvailableAt: new Date(),
    });

    const result = await resendResetPasswordEmail({
      email: "alice@example.com",
      deviceInfo: { browser: "Chrome", os: "Linux", ip: "127.0.0.1" },
    });

    expect(result).toEqual({ sent: true });
    expect(authUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "RESEND_RESET_PASSWORD_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
        userId: "user_1",
        purpose: "RESET_PASSWORD",
        subject: "Reset Password Request",
        htmlContent: "<reset-password-email>",
      }),
      expect.objectContaining({
        jobId: "job-id",
      }),
    );
  });
});
