import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitTestEnvironment as authUnitTestEnvironment,
  mockAuthUnitModules,
  resetAuthUnitTestEnvironment,
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

const { default: register } = await import(
  "../../../../src/services/auth/register.service.js"
);

describe("register service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
    authUnitTestEnvironment.verificationHtml.mockReturnValue(
      "<verification-email>",
    );
    authUnitTestEnvironment.makeUniqueJobId.mockReturnValue("job-id");
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects duplicate emails unless the user is expired and unverified", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      createdAt: new Date("2020-01-01"),
      authProvider: "LOCAL",
      isVerified: true,
    });

    await expect(
      register({
        username: "alice",
        email: "alice@example.com",
        password: "Password1!",
        deviceInfo: { browser: "Chrome", os: "Linux" },
      }),
    ).rejects.toMatchObject({
      message: "Email is already in use",
      statusCode: 400,
    });
  });

  it("registers a user, caches it, and queues a verification email", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);
    authUnitTestEnvironment.prismaUserCreate.mockResolvedValue({
      id: "user_1",
      username: "alice",
      email: "alice@example.com",
      password: "hashed:Password1!:10",
      otp: "hashed:211110:6",
      otpExpireAt: new Date(1_700_000_120_000),
      otpResendAvailableAt: new Date(1_700_000_030_000),
      authProvider: "LOCAL",
      isVerified: false,
      status: "PENDING",
      isDeleted: false,
    });

    const result = await register({
      username: "alice",
      email: "alice@example.com",
      password: "Password1!",
      deviceInfo: {
        browser: "Chrome",
        os: "Linux",
        ip: "127.0.0.1",
      },
    });

    expect(authUnitTestEnvironment.bcryptHash).toHaveBeenNthCalledWith(
      1,
      "Password1!",
      10,
    );
    expect(authUnitTestEnvironment.bcryptHash).toHaveBeenNthCalledWith(
      2,
      "211110",
      6,
    );
    expect(authUnitTestEnvironment.prismaTransaction).toHaveBeenCalled();
    expect(authUnitTestEnvironment.prismaUserCreate).toHaveBeenCalledWith({
      data: {
        username: "alice",
        email: "alice@example.com",
        password: "hashed:Password1!:10",
        otp: "hashed:211110:6",
        otpExpireAt: new Date(1_700_000_120_000),
        otpResendAvailableAt: new Date(1_700_000_030_000),
        moderationStats: { create: {} },
        notificationSettings: { create: {} },
      },
    });
    expect(authUnitTestEnvironment.redisStore.get("user:user_1")).toBeTruthy();
    expect(authUnitTestEnvironment.verificationHtml).toHaveBeenCalledWith(
      "alice",
      "211110",
      "Chrome on Linux",
      "127.0.0.1",
    );
    expect(authUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_VERIFICATION_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
        userId: "user_1",
        purpose: "VERIFY_EMAIL",
        subject: "Verify Email",
        htmlContent: "<verification-email>",
      }),
      expect.objectContaining({
        removeOnComplete: true,
        removeOnFail: false,
        jobId: "job-id",
      }),
    );
    expect(result.user.id).toBe("user_1");
    expect(result.otpExpireAt).toEqual(new Date(1_700_000_120_000));
  });

  it("cleans up expired unverified users instead of blocking registration", async () => {
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_old",
      createdAt: new Date("2020-01-01"),
      authProvider: "LOCAL",
      isVerified: false,
    });
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(true);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      true,
    );
    authUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);
    authUnitTestEnvironment.prismaUserCreate.mockResolvedValue({
      id: "user_2",
      username: "alice",
      email: "alice@example.com",
      password: "hashed:Password1!:10",
      otp: "hashed:223456:6",
      otpExpireAt: new Date(1_700_000_120_000),
      otpResendAvailableAt: new Date(1_700_000_030_000),
      authProvider: "LOCAL",
      isVerified: false,
      status: "PENDING",
      isDeleted: false,
    });

    await register({
      username: "alice",
      email: "alice@example.com",
      password: "Password1!",
      deviceInfo: { browser: "Chrome", os: "Linux" },
    });

    expect(
      authUnitTestEnvironment.cleanupExpiredUnverifiedUserById,
    ).toHaveBeenCalledWith("user_old");
  });
});
