import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/auth/createAuthServiceModuleMock.js";
import { createMockGetDeviceInfoModule } from "../../../helpers/mockGetDeviceInfo.js";
import { mockAuthLimiters } from "../../../helpers/auth/mockAuthLimiters.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/auth/mockAuthContext.js";

const mocks = vi.hoisted(() => ({
  resendResetPasswordEmailService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    resendResetPasswordEmail: mocks.resendResetPasswordEmailService,
  }),
}));

vi.mock("../../../../src/utils/auth/getDeviceInfo.util.js", () =>
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

describe("POST /api/auth/password/reset/resend", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.resendResetPasswordEmailService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = false;
  });

  it("resends the reset password email successfully", async () => {
    mocks.resendResetPasswordEmailService.mockResolvedValue({ sent: true });

    const response = await request(app)
      .post("/api/auth/password/reset/resend")
      .send({
        email: "test@example.com",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully sent reset password OTP",
    });
    expect(mocks.resendResetPasswordEmailService).toHaveBeenCalledWith({
      email: "test@example.com",
      deviceInfo: {
        browser: "Chrome",
        os: "Linux",
        ip: "127.0.0.1",
      },
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .post("/api/auth/password/reset/resend")
      .send({
        email: "bad-email",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.resendResetPasswordEmailService).not.toHaveBeenCalled();
  });

  it("returns service errors", async () => {
    const error = new Error(
      "OTP resend will soon be available, please wait",
    ) as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    mocks.resendResetPasswordEmailService.mockRejectedValue(error);

    const response = await request(app)
      .post("/api/auth/password/reset/resend")
      .send({
        email: "test@example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "OTP resend will soon be available, please wait",
    );
  });

  it("rejects authenticated requests", async () => {
    mockAuthContextState.authenticated = true;

    const response = await request(app)
      .post("/api/auth/password/reset/resend")
      .send({
        email: "test@example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "This action is only available when logged out",
    );
  });
});
