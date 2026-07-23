import { Prisma } from "../../../../src/generated/prisma/client.js";

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

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user_1",
  username: "alice",
  email: "alice@example.com",
  role: "USER",
  createdAt: new Date(),
  updatedAt: new Date(),
  auth: {
    password: "secret",
    tokenVersion: 1,
    authProvider: "LOCAL",
    isVerified: true,
    otp: null,
    otpResendAvailableAt: null,
    otpExpireAt: null,
    resetPasswordOtp: null,
    resetPasswordOtpVerified: null,
    resetPasswordOtpResendAvailableAt: null,
    resetPasswordOtpExpireAt: null,
  },
  profile: {
    displayName: "Alice",
    bio: "bio",
    profilePictureUrl: null,
    profilePictureKey: null,
  },
  stats: {
    reputationPoints: 0,
    questionsAsked: 0,
    answersGiven: 0,
    acceptedAnswers: 0,
    bestAnswers: 0,
    registeredStage: "beta",
  },
  statusState: {
    status: "ACTIVE",
    isDeleted: false,
    deletedAt: null,
    accountDeletionRequestedAt: null,
    accountDeletionCompletedAt: null,
  },
  emailChange: {
    pendingEmail: null,
    otp: null,
    otpExpireAt: null,
    otpResendAvailableAt: null,
  },
  ...overrides,
});

const makeEmailChange = (overrides: Record<string, unknown> = {}) => ({
  userId: "user_1",
  pendingEmail: "new@example.com",
  otp: "hashed-otp",
  otpExpireAt: new Date("2026-01-01T00:02:00.000Z"),
  otpResendAvailableAt: new Date("2026-01-01T00:00:30.000Z"),
  ...overrides,
});

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
        auth: {
          ...makeUser().auth,
          isVerified: false,
        },
      }),
    );
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(makeUser());
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(
      makeUser({ id: "user_2" }),
    );

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(makeUser());
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserEmailChangeUpdate.mockResolvedValue(
      makeEmailChange(),
    );

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "old-pending@example.com",
          otp: "old-hash",
          otpExpireAt: new Date("2026-01-01T00:00:00.000Z"),
          otpResendAvailableAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserEmailChangeUpdate
      .mockResolvedValueOnce(makeEmailChange())
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(makeUser());

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "old-hash",
          otpExpireAt: new Date(),
          otpResendAvailableAt: new Date(Date.now() - 1000),
        },
      }),
    );
    userUnitTestEnvironment.prismaUserEmailChangeUpdate.mockResolvedValue(
      makeEmailChange(),
    );

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "old-hash",
          otpExpireAt: new Date(),
          otpResendAvailableAt: new Date(Date.now() - 1000),
        },
      }),
    );
    userUnitTestEnvironment.prismaUserEmailChangeUpdate
      .mockResolvedValueOnce(makeEmailChange())
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "hashed-otp",
          otpExpireAt: new Date(Date.now() + 60_000),
          otpResendAvailableAt: new Date(),
        },
      }),
    );
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "hashed-otp",
          otpExpireAt: new Date(Date.now() + 60_000),
          otpResendAvailableAt: new Date(),
        },
      }),
    );
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "hashed-otp",
          otpExpireAt: new Date(Date.now() + 60_000),
          otpResendAvailableAt: new Date(),
        },
      }),
    );
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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "hashed-otp",
          otpExpireAt: new Date(Date.now() + 60_000),
          otpResendAvailableAt: new Date(),
        },
      }),
    );
    seedBcryptCompareResult("123456", "hashed-otp", true);
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserFindUniqueOrThrow.mockResolvedValue(
      makeUser({
        email: "new@example.com",
        auth: {
          ...makeUser().auth,
          tokenVersion: 2,
        },
      }),
    );

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
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(
      makeUser({
        emailChange: {
          pendingEmail: "new@example.com",
          otp: "hashed-otp",
          otpExpireAt: new Date(Date.now() + 60_000),
          otpResendAvailableAt: new Date(),
        },
      }),
    );
    seedBcryptCompareResult("123456", "hashed-otp", true);
    userUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    userUnitTestEnvironment.prismaUserFindUniqueOrThrow.mockResolvedValue(
      makeUser({
        email: "new@example.com",
        auth: {
          ...makeUser().auth,
          tokenVersion: 2,
        },
      }),
    );
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
