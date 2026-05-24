import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/createAuthServiceModuleMock.js";
import { mockAuthLimiters } from "../../../helpers/mockAuthLimiters.js";
import { mockAuthMiddlewares } from "../../../helpers/mockAuthMiddlewares.js";

const mocks = vi.hoisted(() => ({
  loginService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    login: mocks.loginService,
  }),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock(
  "../../../../src/middlewares/auth.middleware.js",
  () => mockAuthMiddlewares,
);

const app = await createAuthTestApp();

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.loginService.mockReset();
  });

  it("logs in a user and sets the auth cookie", async () => {
    mocks.loginService.mockResolvedValue({
      user: {
        id: "user_1",
        tokenVersion: 2,
        username: "testUser",
        email: "test@example.com",
        otpExpireAt: null,
        otpResendAvailableAt: null,
        isVerified: true,
      },
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully logged in",
      user: {
        username: "testUser",
        email: "test@example.com",
        otpExpireAt: null,
        otpResendAvailableAt: null,
        isVerified: true,
      },
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.loginService).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "Password1!",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.loginService).not.toHaveBeenCalled();
  });

  it("returns service errors", async () => {
    const error = new Error("Invalid credentials") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;

    mocks.loginService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid credentials");
  });
});
