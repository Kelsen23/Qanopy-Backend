import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/createAuthServiceModuleMock.js";
import { createMockGetDeviceInfoModule } from "../../../helpers/mockGetDeviceInfo.js";
import { mockAuthLimiters } from "../../../helpers/mockAuthLimiters.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/mockAuthContext.js";

const mocks = vi.hoisted(() => ({
  verifyEmailService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    verifyEmail: mocks.verifyEmailService,
  }),
}));

vi.mock("../../../../src/utils/getDeviceInfo.util.js", () =>
  createMockGetDeviceInfoModule(),
);

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createAuthTestApp();

describe("POST /api/auth/email/verify", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.verifyEmailService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = true;
    mockAuthContextState.user = {
      id: "user_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: false,
      role: "USER",
      isDeleted: false,
    };
  });

  it("verifies the email successfully", async () => {
    mocks.verifyEmailService.mockResolvedValue({
      user: {
        id: "user_1",
        username: "testUser",
        email: "test@example.com",
        isVerified: true,
      },
    });

    const response = await request(app).post("/api/auth/email/verify").send({
      otp: "123456",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully verified",
      user: {
        username: "testUser",
        email: "test@example.com",
        isVerified: true,
      },
    });
    expect(mocks.verifyEmailService).toHaveBeenCalledWith({
      userId: "user_1",
      otp: "123456",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/email/verify").send({
      otp: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.verifyEmailService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/auth/email/verify").send({
      otp: "123456",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("returns service errors", async () => {
    const error = new Error("Invalid OTP") as Error & { statusCode?: number };
    error.statusCode = 400;
    mocks.verifyEmailService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/email/verify").send({
      otp: "123456",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid OTP");
  });
});
