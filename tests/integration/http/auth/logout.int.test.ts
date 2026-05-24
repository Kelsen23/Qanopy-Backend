import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { mockAuthLimiters } from "../../../helpers/mockAuthLimiters.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/mockAuthContext.js";

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  register: vi.fn(),
  login: vi.fn(),
  registerOrLogin: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerificationEmail: vi.fn(),
  sendResetPasswordEmail: vi.fn(),
  resendResetPasswordEmail: vi.fn(),
  verifyResetPasswordOtp: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  isAuth: vi.fn(),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createAuthTestApp();

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
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

  it("clears the auth cookie", async () => {
    const response = await request(app).post("/api/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Logged Out" });
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/auth/session");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });
});
