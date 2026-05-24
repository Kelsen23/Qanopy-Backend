import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authMiddlewareEnvironment,
  mockAuthMiddlewareModules,
  resetAuthMiddlewareEnvironment,
  seedJwtPayload,
  seedRedisAuthUser,
} from "../../../helpers/mockAuthMiddlewareEnvironment.js";
import createGraphqlAuthContext from "../../../helpers/createGraphqlAuthContext.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthMiddlewareModules.prismaConfig,
);

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthMiddlewareModules.redisConfig,
);

vi.mock("jsonwebtoken", () => mockAuthMiddlewareModules.jsonwebtoken);

describe("GraphQL auth context", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    resetAuthMiddlewareEnvironment();
  });

  it("rejects missing tokens", async () => {
    await expect(
      createGraphqlAuthContext({
        cookies: {},
      }),
    ).rejects.toMatchObject({
      message: "Not authenticated, no token",
      statusCode: 400,
    });
  });

  it("rejects invalid JWTs", async () => {
    await expect(
      createGraphqlAuthContext({
        cookies: { token: "invalid-token" },
      }),
    ).rejects.toMatchObject({
      message: "Not authenticated, token failed",
      statusCode: 401,
    });
  });

  it("loads auth users from prisma and caches them on a miss", async () => {
    seedJwtPayload("valid-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });

    const context = await createGraphqlAuthContext({
      cookies: { token: "valid-token" },
    });

    expect(context.user).toEqual({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });
    expect(context.loaders.userLoader).toBeDefined();
    expect(
      authMiddlewareEnvironment.prismaUserFindUnique,
    ).toHaveBeenCalledTimes(1);
    expect(authMiddlewareEnvironment.redisStore.get("auth:user:user_1")).toBe(
      JSON.stringify({
        id: "user_1",
        tokenVersion: 0,
        status: "ACTIVE",
        isVerified: true,
        role: "USER",
        isDeleted: false,
      }),
    );
  });

  it("uses cached auth users without a prisma lookup", async () => {
    seedJwtPayload("cached-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    seedRedisAuthUser({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "ADMIN",
      isDeleted: false,
    });

    const context = await createGraphqlAuthContext({
      cookies: { token: "cached-token" },
    });

    expect(context.user).toEqual({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "ADMIN",
      isDeleted: false,
    });
    expect(
      authMiddlewareEnvironment.prismaUserFindUnique,
    ).not.toHaveBeenCalled();
  });

  it("rejects missing users", async () => {
    seedJwtPayload("missing-user-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      createGraphqlAuthContext({
        cookies: { token: "missing-user-token" },
      }),
    ).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });
  });

  it("rejects token version mismatches", async () => {
    seedJwtPayload("stale-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 1,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });

    await expect(
      createGraphqlAuthContext({
        cookies: { token: "stale-token" },
      }),
    ).rejects.toMatchObject({
      message: "User token expired",
      statusCode: 401,
    });
  });

  it("rejects unverified users", async () => {
    seedJwtPayload("unverified-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: false,
      role: "USER",
      isDeleted: false,
    });

    await expect(
      createGraphqlAuthContext({
        cookies: { token: "unverified-token" },
      }),
    ).rejects.toMatchObject({
      message: "User not verified",
      statusCode: 403,
    });
  });

  it("rejects inactive or deleted users", async () => {
    seedJwtPayload("deleted-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      tokenVersion: 0,
      status: "SUSPENDED",
      isVerified: true,
      role: "USER",
      isDeleted: true,
    });

    await expect(
      createGraphqlAuthContext({
        cookies: { token: "deleted-token" },
      }),
    ).rejects.toMatchObject({
      message: "User not active",
      statusCode: 403,
    });
  });
});
