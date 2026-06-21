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
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockAuthUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/email/renderTemplate.util.js",
  () => mockAuthUnitModules.renderTemplate,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);

const { default: sendResetPasswordEmail } = await import(
  "../../../../src/services/auth/sendResetPasswordEmail.service.js"
);

describe("sendResetPasswordEmail service", () => {
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

  it("returns a neutral success response for missing or non-local users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);

    await expect(
      sendResetPasswordEmail({
        email: "alice@example.com",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).resolves.toEqual({ sent: true });
  });

  it("rejects when an active reset otp already exists", async () => {
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
      sendResetPasswordEmail({
        email: "alice@example.com",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "Reset password OTP already sent",
      statusCode: 400,
    });
  });

  it("queues a reset password email for valid users", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: null,
      resetPasswordOtpExpireAt: null,
      resetPasswordOtpResendAvailableAt: null,
    });
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      resetPasswordOtp: "hashed-otp",
      resetPasswordOtpExpireAt: new Date(),
      resetPasswordOtpResendAvailableAt: new Date(),
    });

    const result = await sendResetPasswordEmail({
      email: "alice@example.com",
      deviceInfo: { browser: "Chrome", os: "Linux", ip: "127.0.0.1" },
    });

    expect(result).toEqual({ sent: true });
    expect(authUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_RESET_PASSWORD_EMAIL",
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
