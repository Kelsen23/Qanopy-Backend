import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import createMiddlewareTestApp from "../../../helpers/createMiddlewareTestApp.js";
import AuthenticatedRequest from "../../../../src/types/authenticatedRequest.type.js";
import {
  authMiddlewareEnvironment,
  mockAuthMiddlewareModules,
  resetAuthMiddlewareEnvironment,
  seedJwtPayload,
  seedRedisAuthUser,
} from "../../../helpers/mockAuthMiddlewareEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthMiddlewareModules.prismaConfig,
);

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthMiddlewareModules.redisConfig,
);

vi.mock("jsonwebtoken", () => mockAuthMiddlewareModules.jsonwebtoken);

const { default: isAuthenticated } = await import(
  "../../../../src/middlewares/auth.middleware.js"
);

const app = createMiddlewareTestApp({
  middlewares: [isAuthenticated],
  handler: (req: AuthenticatedRequest, res) => {
    res.status(200).json({ user: req.user });
  },
});

describe("isAuthenticated", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    resetAuthMiddlewareEnvironment();
  });

  it("rejects missing token", async () => {
    const response = await request(app).get("/test");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects invalid jwt", async () => {
    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=invalid-token"]);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated, token failed");
  });

  it("rejects missing users", async () => {
    seedJwtPayload("valid-token", {
      userId: "user_1",
      tokenVersion: 0,
    });
    authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=valid-token"]);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User not found");
  });

  it("rejects token version mismatch", async () => {
    seedJwtPayload("valid-token", {
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

    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=valid-token"]);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("User token expired");
  });

  it("rejects deleted users", async () => {
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
      isDeleted: true,
    });

    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=valid-token"]);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("attaches auth user and caches on miss", async () => {
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

    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=valid-token"]);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    });
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

  it("uses cached auth user without prisma lookup", async () => {
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

    const response = await request(app)
      .get("/test")
      .set("Cookie", ["token=cached-token"]);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
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
});
