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
  resetPasswordService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    resetPassword: mocks.resetPasswordService,
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

describe("POST /api/auth/password/reset", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.resetPasswordService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = false;
  });

  it("resets the password successfully", async () => {
    mocks.resetPasswordService.mockResolvedValue({
      user: { id: "user_1" },
    });

    const response = await request(app).post("/api/auth/password/reset").send({
      email: "test@example.com",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully updated your password",
    });
    expect(mocks.resetPasswordService).toHaveBeenCalledWith({
      email: "test@example.com",
      newPassword: "Password2!",
      deviceInfo: {
        browser: "Unknown Browser",
        os: "Unknown OS",
        ip: "localhost",
        userAgent: "",
      },
    });
  });

  it("rejects the same password", async () => {
    const error = new Error(
      "New password must be different from the old password",
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    mocks.resetPasswordService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/reset").send({
      email: "test@example.com",
      newPassword: "Password1!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "New password must be different from the old password",
    );
  });

  it("rejects when otp was not verified", async () => {
    const error = new Error("OTP not verified") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    mocks.resetPasswordService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/reset").send({
      email: "test@example.com",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP not verified");
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/password/reset").send({
      email: "bad-email",
      newPassword: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.resetPasswordService).not.toHaveBeenCalled();
  });

  it("rejects authenticated requests", async () => {
    mockAuthContextState.authenticated = true;

    const response = await request(app).post("/api/auth/password/reset").send({
      email: "test@example.com",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "This action is only available when logged out",
    );
  });
});
