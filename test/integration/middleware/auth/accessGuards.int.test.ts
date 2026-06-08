import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import createMiddlewareTestApp from "../../../helpers/createMiddlewareTestApp.js";
import {
  authMiddlewareEnvironment,
  mockAuthMiddlewareModules,
  resetAuthMiddlewareEnvironment,
  seedJwtPayload,
} from "../../../helpers/auth/mockAuthMiddlewareEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockAuthMiddlewareModules.prismaConfig,
);

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthMiddlewareModules.redisConfig,
);

vi.mock("jsonwebtoken", () => mockAuthMiddlewareModules.jsonwebtoken);

const {
  requireLoggedOut,
  isVerified,
  requireActiveUser,
  isAdmin,
  default: isAuthenticated,
} = await import("../../../../src/middlewares/auth.middleware.js");

describe("auth guards", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    resetAuthMiddlewareEnvironment();
  });

  describe("requireLoggedOut", () => {
    const app = createMiddlewareTestApp({
      middlewares: [requireLoggedOut],
    });

    it("passes when there is no token", async () => {
      const response = await request(app).get("/test");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ok");
    });

    it("rejects when a valid token is present", async () => {
      seedJwtPayload("valid-token", { userId: "user_1", tokenVersion: 0 });
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

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "This action is only available when logged out",
      );
    });
  });

  describe("isVerified", () => {
    const app = createMiddlewareTestApp({
      middlewares: [isAuthenticated, isVerified],
    });

    beforeEach(() => {
      authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
        id: "user_1",
        tokenVersion: 0,
        status: "ACTIVE",
        isVerified: true,
        role: "USER",
        isDeleted: false,
      });
      seedJwtPayload("verified-token", { userId: "user_1", tokenVersion: 0 });
    });

    it("passes for verified users", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["token=verified-token"]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ok");
    });

    it("rejects unverified users", async () => {
      authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
        id: "user_1",
        tokenVersion: 0,
        status: "ACTIVE",
        isVerified: false,
        role: "USER",
        isDeleted: false,
      });

      const response = await request(app)
        .get("/test")
        .set("Cookie", ["token=verified-token"]);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("User not verified");
    });
  });

  describe("requireActiveUser", () => {
    const app = createMiddlewareTestApp({
      middlewares: [isAuthenticated, requireActiveUser],
    });

    beforeEach(() => {
      seedJwtPayload("active-token", { userId: "user_1", tokenVersion: 0 });
    });

    it("passes for active users", async () => {
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
        .set("Cookie", ["token=active-token"]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ok");
    });

    it("rejects suspended users", async () => {
      authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
        id: "user_1",
        tokenVersion: 0,
        status: "SUSPENDED",
        isVerified: true,
        role: "USER",
        isDeleted: false,
      });

      const response = await request(app)
        .get("/test")
        .set("Cookie", ["token=active-token"]);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("User not active");
    });
  });

  describe("isAdmin", () => {
    const app = createMiddlewareTestApp({
      middlewares: [isAuthenticated, isAdmin],
    });

    beforeEach(() => {
      seedJwtPayload("admin-token", { userId: "user_1", tokenVersion: 0 });
    });

    it("passes for admins", async () => {
      authMiddlewareEnvironment.prismaUserFindUnique.mockResolvedValue({
        id: "user_1",
        tokenVersion: 0,
        status: "ACTIVE",
        isVerified: true,
        role: "ADMIN",
        isDeleted: false,
      });

      const response = await request(app)
        .get("/test")
        .set("Cookie", ["token=admin-token"]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ok");
    });

    it("rejects non-admin users", async () => {
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
        .set("Cookie", ["token=admin-token"]);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("User forbidden accessing this route");
    });
  });
});
