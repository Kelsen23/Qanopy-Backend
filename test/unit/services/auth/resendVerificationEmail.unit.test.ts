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

const { default: resendVerificationEmail } = await import(
  "../../../../src/services/auth/resendVerificationEmail.service.js"
);

describe("resendVerificationEmail service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
    authUnitTestEnvironment.makeUniqueJobId.mockReturnValue("job-id");
    authUnitTestEnvironment.verificationHtml.mockReturnValue(
      "<verification-email>",
    );
  });

  it("rejects missing users", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      resendVerificationEmail({
        userId: "user_1",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "Invalid credentials",
      statusCode: 404,
    });
  });

  it("rejects resend cooldown", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      otp: "hashed-otp",
      otpExpireAt: new Date(Date.now() + 10_000),
      otpResendAvailableAt: new Date(Date.now() + 10_000),
    });

    await expect(
      resendVerificationEmail({
        userId: "user_1",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "OTP resend will soon be available, please wait",
      statusCode: 400,
    });
  });

  it("resends and queues a new verification email", async () => {
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date(),
      email: "alice@example.com",
      username: "alice",
      otp: "hashed-otp",
      otpExpireAt: new Date(Date.now() - 1_000),
      otpResendAvailableAt: new Date(Date.now() - 1_000),
    });
    authUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      authProvider: "LOCAL",
      isVerified: false,
      email: "alice@example.com",
      username: "alice",
      otp: "hashed-new-otp",
      otpExpireAt: new Date(),
      otpResendAvailableAt: new Date(),
    });

    const result = await resendVerificationEmail({
      userId: "user_1",
      deviceInfo: { browser: "Chrome", os: "Linux", ip: "127.0.0.1" },
    });

    expect(result.user.id).toBe("user_1");
    expect(authUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "RESEND_VERIFICATION_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
        subject: "Verify Email",
        htmlContent: "<verification-email>",
      }),
      expect.objectContaining({
        jobId: "job-id",
      }),
    );
  });
});
