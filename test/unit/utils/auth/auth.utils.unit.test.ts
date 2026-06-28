import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthUnitModules,
  mockAuthUnitTestEnvironment as env,
  resetAuthUnitTestEnvironment,
} from "../../../helpers/auth/mockAuthUnitTestEnvironment.js";

const jwtSign = vi.fn();
const googleVerifyIdToken = vi.fn();

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthUnitModules.prismaConfig,
);
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: jwtSign,
  },
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class OAuth2Client {
    verifyIdToken = googleVerifyIdToken;
  },
}));

const { default: buildDeletedUserData } = await import(
  "../../../../src/utils/auth/buildDeletedUserData.util.js"
);
const { default: generateOAuthUsername } = await import(
  "../../../../src/utils/auth/generateOAuthUsername.util.js"
);
const { default: generateToken } = await import(
  "../../../../src/utils/auth/generateToken.util.js"
);
const { default: getDeviceInfo } = await import(
  "../../../../src/utils/auth/getDeviceInfo.util.js"
);
const { default: sanitizeUser } = await import(
  "../../../../src/utils/auth/sanitizeUser.util.js"
);
const { default: sanitizeUserForAuth } = await import(
  "../../../../src/utils/auth/sanitizeUserForAuth.util.js"
);
const { default: verifyGoogleToken } = await import(
  "../../../../src/utils/auth/verifyGoogleToken.util.js"
);

describe("auth utils", () => {
  beforeEach(() => {
    resetAuthUnitTestEnvironment();
    jwtSign.mockReset().mockReturnValue("signed-token");
    googleVerifyIdToken.mockReset();
  });

  it("builds deleted user data and resolves a unique username candidate", async () => {
    const result = await buildDeletedUserData(
      "abcd-ef12-3456",
      new Date("2030-01-01"),
      async (candidate) => candidate === "deleted_abcdef12_1",
    );

    expect(result).toMatchObject({
      username: "deleted_abcdef12_1",
      email: "deleted_abcdef12_1@deleted.local",
      displayName: "Deleted User",
      status: "TERMINATED",
      isDeleted: true,
    });
  });

  it("throws when no deleted username can be reserved", async () => {
    await expect(
      buildDeletedUserData(
        "abcd-ef12-3456",
        new Date("2030-01-01"),
        async () => false,
      ),
    ).rejects.toThrow("Unable to reserve a deleted username");
  });

  it("generates an oauth username from the base value or a prefixed fallback", async () => {
    env.prismaUserFindUnique.mockImplementationOnce(async () => null);
    await expect(generateOAuthUsername("alice")).resolves.toBe("alice");

    env.prismaUserFindUnique.mockReset();
    env.prismaUserFindUnique.mockImplementation(
      async ({ where }: { where: { username: string } }) =>
        where.username === "alice" ? ({ id: "user_1" } as any) : null,
    );
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.12);
    await expect(generateOAuthUsername("alice")).resolves.toBe("20alic");
    randomSpy.mockRestore();
  });

  it("signs auth cookies with the expected token payload and options", () => {
    const cookie = vi.fn();
    const response = { cookie } as any;

    generateToken(response, "user_1", 3);

    expect(jwtSign).toHaveBeenCalledWith(
      { userId: "user_1", tokenVersion: 3 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    expect(cookie).toHaveBeenCalledWith(
      "token",
      "signed-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
      }),
    );
  });

  it("extracts browser, os, ip, and truncated user agent details", () => {
    const request = {
      get: vi.fn(() => "Mozilla/5.0 Chrome Windows NT 10.0"),
      ip: "::ffff:127.0.0.1",
      connection: { remoteAddress: null },
    } as any;

    expect(getDeviceInfo(request)).toEqual({
      browser: "Chrome",
      os: "Windows 10",
      ip: "localhost",
      userAgent: "Mozilla/5.0 Chrome Windows NT 10.0",
    });
  });

  it("sanitizes full user objects and auth payloads", () => {
    const user = {
      id: "user_1",
      email: "alice@example.com",
      password: "secret",
      tokenVersion: 4,
      registeredStage: "beta",
      otp: "123456",
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
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    } as any;

    expect(sanitizeUser(user)).toEqual({
      id: "user_1",
      email: "alice@example.com",
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });
    expect(
      sanitizeUserForAuth({
        id: "user_1",
        status: "ACTIVE",
        isVerified: true,
        role: "USER",
      }),
    ).toEqual({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });
  });

  it("verifies google tokens and normalizes the returned payload", async () => {
    googleVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: "alice@example.com",
        name: "Alice",
        picture: "https://example.com/avatar.png",
        email_verified: true,
        sub: "google_1",
      }),
    });

    await expect(verifyGoogleToken("token")).resolves.toEqual({
      email: "alice@example.com",
      name: "Alice",
      picture: "https://example.com/avatar.png",
      email_verified: true,
      googleId: "google_1",
    });
  });

  it("wraps google token verification failures in a 500 http error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    googleVerifyIdToken.mockRejectedValueOnce(new Error("google down"));

    await expect(verifyGoogleToken("bad-token")).rejects.toMatchObject({
      message: "Google ID token verification failed",
      statusCode: 500,
    });

    consoleError.mockRestore();
  });
});
