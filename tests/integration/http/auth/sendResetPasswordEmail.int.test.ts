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
  sendResetPasswordEmailService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    sendResetPasswordEmail: mocks.sendResetPasswordEmailService,
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

describe("POST /api/auth/password/reset/send", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.sendResetPasswordEmailService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = false;
  });

  it("sends reset password email for existing accounts", async () => {
    mocks.sendResetPasswordEmailService.mockResolvedValue({ sent: true });

    const response = await request(app)
      .post("/api/auth/password/reset/send")
      .send({
        email: "test@example.com",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "If account exists, an email was sent",
    });
    expect(mocks.sendResetPasswordEmailService).toHaveBeenCalledWith({
      email: "test@example.com",
      deviceInfo: {
        browser: "Chrome",
        os: "Linux",
        ip: "127.0.0.1",
      },
    });
  });

  it("also responds safely when the account does not exist", async () => {
    mocks.sendResetPasswordEmailService.mockResolvedValue({ sent: true });

    const response = await request(app)
      .post("/api/auth/password/reset/send")
      .send({
        email: "missing@example.com",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "If account exists, an email was sent",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .post("/api/auth/password/reset/send")
      .send({
        email: "bad-email",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.sendResetPasswordEmailService).not.toHaveBeenCalled();
  });

  it("rejects authenticated requests", async () => {
    mockAuthContextState.authenticated = true;

    const response = await request(app)
      .post("/api/auth/password/reset/send")
      .send({
        email: "test@example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "This action is only available when logged out",
    );
  });
});
