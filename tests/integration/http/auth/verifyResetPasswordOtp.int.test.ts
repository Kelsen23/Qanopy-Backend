import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/createAuthServiceModuleMock.js";
import { mockAuthLimiters } from "../../../helpers/mockAuthLimiters.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/mockAuthContext.js";

const mocks = vi.hoisted(() => ({
  verifyResetPasswordOtpService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    verifyResetPasswordOtp: mocks.verifyResetPasswordOtpService,
  }),
}));

vi.mock("../../../../src/middlewares/rate-limiters/auth.rate-limiters.js", () =>
  mockAuthLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createAuthTestApp();

describe("POST /api/auth/password/reset/verify", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.verifyResetPasswordOtpService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = false;
  });

  it("verifies the reset password OTP successfully", async () => {
    mocks.verifyResetPasswordOtpService.mockResolvedValue({ verified: true });

    const response = await request(app).post("/api/auth/password/reset/verify").send({
      email: "test@example.com",
      otp: "123456",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully verified OTP",
    });
    expect(mocks.verifyResetPasswordOtpService).toHaveBeenCalledWith({
      email: "test@example.com",
      otp: "123456",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/password/reset/verify").send({
      email: "bad-email",
      otp: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.verifyResetPasswordOtpService).not.toHaveBeenCalled();
  });

  it("returns service errors for invalid otp", async () => {
    const error = new Error("Invalid reset password OTP") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    mocks.verifyResetPasswordOtpService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/reset/verify").send({
      email: "test@example.com",
      otp: "123456",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid reset password OTP");
  });

  it("returns service errors for expired otp", async () => {
    const error = new Error("Reset password OTP expired") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    mocks.verifyResetPasswordOtpService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/reset/verify").send({
      email: "test@example.com",
      otp: "123456",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Reset password OTP expired");
  });

  it("rejects authenticated requests", async () => {
    mockAuthContextState.authenticated = true;

    const response = await request(app).post("/api/auth/password/reset/verify").send({
      email: "test@example.com",
      otp: "123456",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "This action is only available when logged out",
    );
  });
});
