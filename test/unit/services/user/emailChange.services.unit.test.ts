import { Prisma } from "../../../../src/generated/prisma/index.js";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  resetUserUnitTestEnvironment,
  seedBcryptCompareResult,
  seedRedisValue,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockUserUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserUnitModules.redisConfig,
);
vi.mock("bcrypt", () => mockUserUnitModules.bcrypt);
vi.mock(
  "../../../../src/queues/email.queue.js",
  () => mockUserUnitModules.emailQueue,
);
vi.mock(
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockUserUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/email/renderTemplate.util.js",
  () => mockUserUnitModules.renderTemplate,
);
vi.mock(
  "../../../../src/services/auth/auth.shared.js",
  () => mockUserUnitModules.authShared,
);
vi.mock(
  "../../../../src/services/user/emailChange.shared.js",
  () => mockUserUnitModules.emailChangeShared,
);
vi.mock(
  "../../../../src/utils/socket/publishSocketDisconnect.util.js",
  () => mockUserUnitModules.publishSocketDisconnect,
);

const { default: sendEmailChange } = await import(
  "../../../../src/services/user/sendEmailChange.service.js"
);
const { default: resendEmailChange } = await import(
  "../../../../src/services/user/resendEmailChange.service.js"
);
const { default: verifyEmailChange } = await import(
  "../../../../src/services/user/verifyEmailChange.service.js"
);

const deviceInfo = {
  browser: "Chrome",
  os: "Linux",
  ip: "127.0.0.1",
};

describe("user email change services", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing users when sending an email change", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      sendEmailChange({
        userId: "user_1",
        newEmail: "new@example.com",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });
  });

  it("rejects expired unverified users when sending an email change", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "alice@example.com",
      authProvider: "LOCAL",
      isVerified: false,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtpResendAvailableAt: null,
    });
    userUnitTestEnvironment.handleExpiredUnverifiedUser.mockResolvedValue(true);

    await expect(
      sendEmailChange({
        userId: "user_1",
        newEmail: "new@example.com",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Email verification expired, please sign up again",
      statusCode: 410,
    });
  });

  it("rejects conflicting active users when sending an email change", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "alice@example.com",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtpResendAvailableAt: null,
    });
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_2",
      createdAt: new Date(),
      authProvider: "LOCAL",
      isVerified: true,
    });

    await expect(
      sendEmailChange({
        userId: "user_1",
        newEmail: "new@example.com",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Email is already in use",
      statusCode: 400,
    });
  });

  it("hashes the otp, updates the user, clears attempts, and enqueues the email change otp", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "alice@example.com",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtpResendAvailableAt: null,
    });
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      username: "alice",
      emailChangePendingEmail: "new@example.com",
      emailChangeOtpExpireAt: new Date("2026-01-01T00:02:00.000Z"),
      emailChangeOtpResendAvailableAt: new Date("2026-01-01T00:00:30.000Z"),
    });

    const result = await sendEmailChange({
      userId: "user_1",
      newEmail: "new@example.com",
      deviceInfo,
    });

    expect(userUnitTestEnvironment.bcryptHash).toHaveBeenCalled();
    expect(
      userUnitTestEnvironment.removeEmailChangeAttempts,
    ).toHaveBeenCalledWith("user_1");
    expect(userUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_EMAIL_CHANGE",
      expect.objectContaining({
        email: "new@example.com",
        userId: "user_1",
      }),
      expect.objectContaining({
        jobId: "unique__email__SEND_EMAIL_CHANGE__user_1__new@example.com",
      }),
    );
    expect(result.pendingEmail).toBe("new@example.com");
  });

  it("rolls state back and clears cache if sending the email change job fails", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "alice@example.com",
      authProvider: "LOCAL",
      isVerified: true,
      createdAt: new Date(),
      emailChangePendingEmail: "old-pending@example.com",
      emailChangeOtp: "old-hash",
      emailChangeOtpExpireAt: new Date("2026-01-01T00:00:00.000Z"),
      emailChangeOtpResendAvailableAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserUpdate
      .mockResolvedValueOnce({
        id: "user_1",
        username: "alice",
        emailChangePendingEmail: "new@example.com",
        emailChangeOtpExpireAt: new Date(),
        emailChangeOtpResendAvailableAt: new Date(),
      })
      .mockResolvedValueOnce({});
    userUnitTestEnvironment.emailQueueAdd.mockRejectedValue(
      new Error("queue failed"),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      sendEmailChange({
        userId: "user_1",
        newEmail: "new@example.com",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Failed to send email change OTP",
      statusCode: 503,
    });

    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:user_1",
    );
    errorSpy.mockRestore();
  });

  it("rejects resend requests when otp state is incomplete", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpExpireAt: null,
      emailChangeOtpResendAvailableAt: null,
    });

    await expect(
      resendEmailChange({
        userId: "user_1",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Email change OTP not set",
      statusCode: 400,
    });
  });

  it("rehashes and re-enqueues resend email change jobs", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "old-hash",
      emailChangeOtpExpireAt: new Date(),
      emailChangeOtpResendAvailableAt: new Date(Date.now() - 1000),
    });
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      username: "alice",
      emailChangePendingEmail: "new@example.com",
      emailChangeOtpExpireAt: new Date("2026-01-01T00:02:00.000Z"),
      emailChangeOtpResendAvailableAt: new Date("2026-01-01T00:00:30.000Z"),
    });

    const result = await resendEmailChange({
      userId: "user_1",
      deviceInfo,
    });

    expect(userUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "RESEND_EMAIL_CHANGE",
      expect.objectContaining({
        email: "new@example.com",
      }),
      expect.objectContaining({
        jobId: "unique__email__RESEND_EMAIL_CHANGE__user_1__new@example.com",
      }),
    );
    expect(
      userUnitTestEnvironment.removeEmailChangeAttempts,
    ).toHaveBeenCalledWith("user_1");
    expect(result.pendingEmail).toBe("new@example.com");
  });

  it("rolls resend state back and clears cache if queueing fails", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      username: "alice",
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "old-hash",
      emailChangeOtpExpireAt: new Date(),
      emailChangeOtpResendAvailableAt: new Date(Date.now() - 1000),
    });
    userUnitTestEnvironment.prismaUserUpdate
      .mockResolvedValueOnce({
        id: "user_1",
        username: "alice",
        emailChangePendingEmail: "new@example.com",
        emailChangeOtpExpireAt: new Date(),
        emailChangeOtpResendAvailableAt: new Date(),
      })
      .mockResolvedValueOnce({});
    userUnitTestEnvironment.emailQueueAdd.mockRejectedValue(
      new Error("queue failed"),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      resendEmailChange({
        userId: "user_1",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Failed to send email change OTP",
      statusCode: 503,
    });

    expect(userUnitTestEnvironment.redisDel).toHaveBeenCalledWith(
      "user:user_1",
    );
    errorSpy.mockRestore();
  });

  it("rejects locked verify attempts", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isVerified: true,
      tokenVersion: 1,
      authProvider: "LOCAL",
      createdAt: new Date(),
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "hashed-otp",
      emailChangeOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangeOtpResendAvailableAt: new Date(),
    });
    seedRedisValue("user:email-change:attempts:user_1", "5");

    await expect(
      verifyEmailChange({
        userId: "user_1",
        otp: "123456",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Too many invalid attempts, OTP locked",
      statusCode: 400,
    });
  });

  it("increments redis attempts for invalid otps", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isVerified: true,
      tokenVersion: 1,
      authProvider: "LOCAL",
      createdAt: new Date(),
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "hashed-otp",
      emailChangeOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangeOtpResendAvailableAt: new Date(),
    });
    seedBcryptCompareResult("123456", "hashed-otp", false);

    await expect(
      verifyEmailChange({
        userId: "user_1",
        otp: "123456",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Invalid email change OTP",
      statusCode: 400,
    });

    expect(userUnitTestEnvironment.redisMultiChain.incr).toHaveBeenCalledWith(
      "user:email-change:attempts:user_1",
    );
    expect(userUnitTestEnvironment.redisMultiChain.expire).toHaveBeenCalledWith(
      "user:email-change:attempts:user_1",
      120,
    );
  });

  it("converts prisma unique conflicts into an email-in-use error", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isVerified: true,
      tokenVersion: 1,
      authProvider: "LOCAL",
      createdAt: new Date(),
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "hashed-otp",
      emailChangeOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangeOtpResendAvailableAt: new Date(),
    });
    seedBcryptCompareResult("123456", "hashed-otp", true);
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      verifyEmailChange({
        userId: "user_1",
        otp: "123456",
        deviceInfo,
      }),
    ).rejects.toMatchObject({
      message: "Email is already in use",
      statusCode: 400,
    });
  });

  it("updates the email, refreshes cache, clears attempts, disconnects sockets, and queues the security notice", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isVerified: true,
      tokenVersion: 1,
      authProvider: "LOCAL",
      createdAt: new Date(),
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "hashed-otp",
      emailChangeOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangeOtpResendAvailableAt: new Date(),
    });
    seedBcryptCompareResult("123456", "hashed-otp", true);
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "new@example.com",
      password: "secret",
      tokenVersion: 2,
      registeredStage: "beta",
      otp: null,
      otpResendAvailableAt: null,
      otpExpireAt: null,
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpResendAvailableAt: null,
      emailChangeOtpExpireAt: null,
      creditsLastRedeemedAt: null,
      deletedAt: null,
      accountDeletionRequestedAt: null,
      accountDeletionCompletedAt: null,
      displayName: "Alice",
      bio: "bio",
      role: "USER",
      status: "ACTIVE",
      isDeleted: false,
      credits: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyEmailChange({
      userId: "user_1",
      otp: "123456",
      deviceInfo,
    });

    expect(userUnitTestEnvironment.cacheUser).toHaveBeenCalled();
    expect(userUnitTestEnvironment.cacheAuthUser).toHaveBeenCalled();
    expect(
      userUnitTestEnvironment.removeEmailChangeAttempts,
    ).toHaveBeenCalledWith("user_1");
    expect(
      userUnitTestEnvironment.publishSocketDisconnect,
    ).toHaveBeenCalledWith("user_1");
    expect(userUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_EMAIL_CHANGED_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
      }),
      expect.objectContaining({
        jobId:
          "unique__email__SEND_EMAIL_CHANGED_EMAIL__user_1__alice@example.com",
      }),
    );
    expect(result.user.email).toBe("new@example.com");
    expect(result.user).not.toHaveProperty("password");
  });

  it("does not fail successful verification when follow-up tasks fail", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isVerified: true,
      tokenVersion: 1,
      authProvider: "LOCAL",
      createdAt: new Date(),
      emailChangePendingEmail: "new@example.com",
      emailChangeOtp: "hashed-otp",
      emailChangeOtpExpireAt: new Date(Date.now() + 60_000),
      emailChangeOtpResendAvailableAt: new Date(),
    });
    seedBcryptCompareResult("123456", "hashed-otp", true);
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserUpdate.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "new@example.com",
      password: "secret",
      tokenVersion: 2,
      registeredStage: "beta",
      otp: null,
      otpResendAvailableAt: null,
      otpExpireAt: null,
      resetPasswordOtp: null,
      resetPasswordOtpVerified: null,
      resetPasswordOtpResendAvailableAt: null,
      resetPasswordOtpExpireAt: null,
      emailChangePendingEmail: null,
      emailChangeOtp: null,
      emailChangeOtpResendAvailableAt: null,
      emailChangeOtpExpireAt: null,
      creditsLastRedeemedAt: null,
      deletedAt: null,
      accountDeletionRequestedAt: null,
      accountDeletionCompletedAt: null,
      displayName: "Alice",
      bio: "bio",
      role: "USER",
      status: "ACTIVE",
      isDeleted: false,
      credits: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userUnitTestEnvironment.cacheUser.mockRejectedValue(
      new Error("cache failed"),
    );
    userUnitTestEnvironment.cacheAuthUser.mockRejectedValue(
      new Error("auth cache failed"),
    );
    userUnitTestEnvironment.removeEmailChangeAttempts.mockRejectedValue(
      new Error("clear failed"),
    );
    userUnitTestEnvironment.publishSocketDisconnect.mockRejectedValue(
      new Error("disconnect failed"),
    );
    userUnitTestEnvironment.emailQueueAdd.mockRejectedValue(
      new Error("email queue failed"),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      verifyEmailChange({
        userId: "user_1",
        otp: "123456",
        deviceInfo,
      }),
    ).resolves.toMatchObject({
      user: {
        email: "new@example.com",
      },
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
