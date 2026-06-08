import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/auth/createAuthServiceModuleMock.js";
import { mockAuthLimiters } from "../../../helpers/auth/mockAuthLimiters.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/auth/mockAuthContext.js";

const mocks = vi.hoisted(() => ({
  isAuthService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    isAuth: mocks.isAuthService,
  }),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createAuthTestApp();

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.isAuthService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = true;
    mockAuthContextState.user = {
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: false,
    };
  });

  it("returns the authenticated user", async () => {
    mocks.isAuthService.mockResolvedValue({
      user: {
        id: "user_1",
        username: "testUser",
        email: "test@example.com",
        isVerified: true,
      },
    });

    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully authenticated",
      user: {
        id: "user_1",
        username: "testUser",
        email: "test@example.com",
        isVerified: true,
      },
    });
    expect(mocks.isAuthService).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("rejects missing token", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects invalid token", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 401,
      message: "Not authenticated, token failed",
    };

    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated, token failed");
  });

  it("rejects expired tokens", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 401,
      message: "User token expired",
    };

    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("User token expired");
  });

  it("rejects deleted users", async () => {
    mockAuthContextState.user = {
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "USER",
      isDeleted: true,
    };

    const response = await request(app).get("/api/auth/session");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });
});
