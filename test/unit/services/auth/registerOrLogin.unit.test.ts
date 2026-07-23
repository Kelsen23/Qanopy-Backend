import { Prisma } from "../../../../src/generated/prisma/client.js";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock(
  "../../../../src/utils/auth/generateOAuthUsername.util.js",
  () => mockAuthUnitModules.generateOAuthUsername,
);
vi.mock(
  "../../../../src/utils/auth/verifyGoogleToken.util.js",
  () => mockAuthUnitModules.verifyGoogleToken,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthUnitModules.unverifiedAccountCleanup,
);
vi.mock(
  "../../../../src/services/user/badge/queueBadgeAward.service.js",
  () => mockAuthUnitModules.queueBadgeAwardService,
);

const { default: registerOrLogin } = await import(
  "../../../../src/services/auth/registerOrLogin.service.js"
);

describe("registerOrLogin service", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    authUnitTestEnvironment.isExpiredUnverifiedLocalUser.mockReturnValue(false);
    authUnitTestEnvironment.cleanupExpiredUnverifiedUserById.mockResolvedValue(
      false,
    );
    authUnitTestEnvironment.generateOAuthUsername.mockResolvedValue(
      "oauth-user",
    );
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects google tokens with unverified emails", async () => {
    authUnitTestEnvironment.verifyGoogleToken.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice",
      picture: "pic",
      email_verified: false,
      googleId: "g-1",
    });

    await expect(
      registerOrLogin({ provider: "google", idToken: "token" }),
    ).rejects.toMatchObject({
      message: "Email not verified, couldn't register",
      statusCode: 400,
    });
  });

  it("registers new google users", async () => {
    authUnitTestEnvironment.verifyGoogleToken.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice",
      picture: "pic",
      email_verified: true,
      googleId: "g-1",
    });
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    authUnitTestEnvironment.prismaUserCreate.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "oauth-user",
      profilePictureUrl: "pic",
      authProvider: "GOOGLE",
      isVerified: true,
      status: "ACTIVE",
      isDeleted: false,
    });

    const result = await registerOrLogin({
      provider: "google",
      idToken: "token",
    });

    expect(result.action).toBe("registered");
    expect(authUnitTestEnvironment.prismaUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "oauth-user",
        email: "alice@example.com",
        auth: {
          create: expect.objectContaining({
            isVerified: true,
            authProvider: "GOOGLE",
          }),
        },
        profile: { create: { profilePictureUrl: "pic" } },
      }),
      include: expect.any(Object),
    });
    expect(authUnitTestEnvironment.queueBadgeAward).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("retries google registration when a generated username loses a create race", async () => {
    authUnitTestEnvironment.verifyGoogleToken.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice",
      picture: "pic",
      email_verified: true,
      googleId: "g-1",
    });
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    authUnitTestEnvironment.generateOAuthUsername
      .mockResolvedValueOnce("oauth-user")
      .mockResolvedValueOnce("oauth-user-2");
    authUnitTestEnvironment.prismaUserCreate
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("conflict", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["username"] },
        }),
      )
      .mockResolvedValueOnce({
        id: "user_1",
        email: "alice@example.com",
        username: "oauth-user-2",
        profilePictureUrl: "pic",
        authProvider: "GOOGLE",
        isVerified: true,
        status: "ACTIVE",
        isDeleted: false,
      });

    const result = await registerOrLogin({
      provider: "google",
      idToken: "token",
    });

    expect(result.action).toBe("registered");
    expect(authUnitTestEnvironment.generateOAuthUsername).toHaveBeenCalledTimes(
      2,
    );
    expect(authUnitTestEnvironment.prismaUserCreate).toHaveBeenNthCalledWith(
      2,
      {
        data: expect.objectContaining({
          username: "oauth-user-2",
          email: "alice@example.com",
          auth: {
            create: expect.objectContaining({
              authProvider: "GOOGLE",
            }),
          },
        }),
        include: expect.any(Object),
      },
    );
  });

  it("fails google registration after repeated username create races", async () => {
    authUnitTestEnvironment.verifyGoogleToken.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice",
      picture: "pic",
      email_verified: true,
      googleId: "g-1",
    });
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    authUnitTestEnvironment.generateOAuthUsername.mockResolvedValue(
      "oauth-user",
    );
    authUnitTestEnvironment.prismaUserCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["username"] },
      }),
    );

    await expect(
      registerOrLogin({ provider: "google", idToken: "token" }),
    ).rejects.toMatchObject({
      message: "Unable to reserve OAuth username",
      statusCode: 409,
    });
    expect(authUnitTestEnvironment.generateOAuthUsername).toHaveBeenCalledTimes(
      3,
    );
    expect(authUnitTestEnvironment.prismaUserCreate).toHaveBeenCalledTimes(3);
  });

  it("logs in existing google users", async () => {
    authUnitTestEnvironment.verifyGoogleToken.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice",
      picture: "pic",
      email_verified: true,
      googleId: "g-1",
    });
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "oauth-user",
      authProvider: "GOOGLE",
      isVerified: true,
      status: "ACTIVE",
      isDeleted: false,
    });

    const result = await registerOrLogin({
      provider: "google",
      idToken: "token",
    });

    expect(result.action).toBe("loggedIn");
    expect(authUnitTestEnvironment.redisStore.get("user:user_1")).toBeTruthy();
  });

  it("rejects github tokens that do not contain required fields", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ email: null, name: null }),
    });

    await expect(
      registerOrLogin({ provider: "github", accessToken: "token" }),
    ).rejects.toMatchObject({
      message: "Invalid Github access token",
      statusCode: 400,
    });
  });

  it("registers new github users", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        email: "alice@example.com",
        name: "Alice",
        avatar_url: "avatar",
      }),
    });
    authUnitTestEnvironment.prismaUserFindFirst.mockResolvedValue(null);
    authUnitTestEnvironment.prismaUserCreate.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      username: "oauth-user",
      profilePictureUrl: "avatar",
      authProvider: "GITHUB",
      isVerified: true,
      status: "ACTIVE",
      isDeleted: false,
    });

    const result = await registerOrLogin({
      provider: "github",
      accessToken: "token",
    });

    expect(result.action).toBe("registered");
    expect(authUnitTestEnvironment.prismaUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "oauth-user",
        email: "alice@example.com",
        auth: {
          create: expect.objectContaining({
            isVerified: true,
            authProvider: "GITHUB",
          }),
        },
        profile: { create: { profilePictureUrl: "avatar" } },
      }),
      include: expect.any(Object),
    });
    expect(authUnitTestEnvironment.queueBadgeAward).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });
});
