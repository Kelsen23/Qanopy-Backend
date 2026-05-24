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
  resendVerificationEmailService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    resendVerificationEmail: mocks.resendVerificationEmailService,
  }),
}));

vi.mock("../../../../src/utils/getDeviceInfo.util.js", () =>
  createMockGetDeviceInfoModule(),
);

vi.mock("../../../../src/middlewares/rate-limiters/auth.rate-limiters.js", () =>
  mockAuthLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createAuthTestApp();

describe("POST /api/auth/email/resend", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.resendVerificationEmailService.mockReset();
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

  it("resends the verification email successfully", async () => {
    mocks.resendVerificationEmailService.mockResolvedValue({
      user: { id: "user_1" },
    });

    const response = await request(app).post("/api/auth/email/resend").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully sent another OTP to your email address",
    });
    expect(mocks.resendVerificationEmailService).toHaveBeenCalledWith({
      userId: "user_1",
      deviceInfo: {
        browser: "Chrome",
        os: "Linux",
        ip: "127.0.0.1",
      },
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/auth/email/resend").send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("returns service errors", async () => {
    const error = new Error("User already verified") as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    mocks.resendVerificationEmailService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/email/resend").send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User already verified");
  });
});
