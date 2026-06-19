import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createUserTestApp } from "../../../helpers/createTestApp.js";
import { createUserServiceModuleMock } from "../../../helpers/user/createUserServiceModuleMock.js";
import {
  createMockGetDeviceInfoModule,
  defaultMockDeviceInfo,
} from "../../../helpers/mockGetDeviceInfo.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/auth/mockAuthContext.js";
import { mockUserLimiters } from "../../../helpers/user/mockUserLimiters.js";

const mocks = vi.hoisted(() => ({
  sendEmailChangeService: vi.fn(),
  resendEmailChangeService: vi.fn(),
  verifyEmailChangeService: vi.fn(),
}));

vi.mock("../../../../src/services/user/user.service.js", () => ({
  ...createUserServiceModuleMock({
    sendEmailChange: mocks.sendEmailChangeService,
    resendEmailChange: mocks.resendEmailChangeService,
    verifyEmailChange: mocks.verifyEmailChangeService,
  }),
}));

vi.mock("../../../../src/utils/auth/getDeviceInfo.util.js", () =>
  createMockGetDeviceInfoModule(defaultMockDeviceInfo),
);

vi.mock(
  "../../../../src/middlewares/rate-limiters/user.rate-limiters.js",
  () => mockUserLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createUserTestApp();

describe("POST /api/user/email/change/send", () => {
  beforeEach(() => {
    mocks.sendEmailChangeService.mockReset();
    mocks.resendEmailChangeService.mockReset();
    mocks.verifyEmailChangeService.mockReset();
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

  it("sends the email change OTP successfully", async () => {
    mocks.sendEmailChangeService.mockResolvedValue({
      pendingEmail: "new@example.com",
      emailChangeOtpExpireAt: new Date("2026-01-01T00:00:00.000Z"),
      emailChangeOtpResendAvailableAt: new Date("2026-01-01T00:00:30.000Z"),
    });

    const response = await request(app)
      .post("/api/user/email/change/send")
      .send({
        newEmail: "new@example.com",
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Email change OTP sent",
      pendingEmail: "new@example.com",
      emailChangeOtpExpireAt: "2026-01-01T00:00:00.000Z",
      emailChangeOtpResendAvailableAt: "2026-01-01T00:00:30.000Z",
    });
    expect(mocks.sendEmailChangeService).toHaveBeenCalledWith({
      userId: "user_1",
      newEmail: "new@example.com",
      deviceInfo: defaultMockDeviceInfo,
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .post("/api/user/email/change/send")
      .send({
        newEmail: "not-an-email",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.sendEmailChangeService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .post("/api/user/email/change/send")
      .send({
        newEmail: "new@example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .post("/api/user/email/change/send")
      .send({
        newEmail: "new@example.com",
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Email is already in use") as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    mocks.sendEmailChangeService.mockRejectedValue(error);

    const response = await request(app)
      .post("/api/user/email/change/send")
      .send({
        newEmail: "new@example.com",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Email is already in use");
  });
});

describe("POST /api/user/email/change/resend", () => {
  beforeEach(() => {
    mocks.sendEmailChangeService.mockReset();
    mocks.resendEmailChangeService.mockReset();
    mocks.verifyEmailChangeService.mockReset();
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

  it("resends the email change OTP successfully", async () => {
    mocks.resendEmailChangeService.mockResolvedValue({
      pendingEmail: "new@example.com",
      emailChangeOtpExpireAt: new Date("2026-01-01T00:10:00.000Z"),
      emailChangeOtpResendAvailableAt: new Date("2026-01-01T00:10:30.000Z"),
    });

    const response = await request(app).post("/api/user/email/change/resend");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Successfully sent another OTP to your new email address",
      pendingEmail: "new@example.com",
      emailChangeOtpExpireAt: "2026-01-01T00:10:00.000Z",
      emailChangeOtpResendAvailableAt: "2026-01-01T00:10:30.000Z",
    });
    expect(mocks.resendEmailChangeService).toHaveBeenCalledWith({
      userId: "user_1",
      deviceInfo: defaultMockDeviceInfo,
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/user/email/change/resend");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).post("/api/user/email/change/resend");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("OTP resend is not available yet") as Error & {
      statusCode?: number;
    };
    error.statusCode = 429;
    mocks.resendEmailChangeService.mockRejectedValue(error);

    const response = await request(app).post("/api/user/email/change/resend");

    expect(response.status).toBe(429);
    expect(response.body.message).toBe("OTP resend is not available yet");
  });
});

describe("POST /api/user/email/change/verify", () => {
  beforeEach(() => {
    mocks.sendEmailChangeService.mockReset();
    mocks.resendEmailChangeService.mockReset();
    mocks.verifyEmailChangeService.mockReset();
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

  it("verifies the email change successfully and clears the auth cookie", async () => {
    mocks.verifyEmailChangeService.mockResolvedValue({
      user: {
        id: "user_1",
        email: "new@example.com",
      },
    });

    const response = await request(app)
      .post("/api/user/email/change/verify")
      .send({
        otp: "123456",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully changed email, please sign in again",
      user: {
        id: "user_1",
        email: "new@example.com",
      },
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.verifyEmailChangeService).toHaveBeenCalledWith({
      userId: "user_1",
      otp: "123456",
      deviceInfo: defaultMockDeviceInfo,
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .post("/api/user/email/change/verify")
      .send({
        otp: "123",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.verifyEmailChangeService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .post("/api/user/email/change/verify")
      .send({
        otp: "123456",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .post("/api/user/email/change/verify")
      .send({
        otp: "123456",
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Invalid OTP") as Error & { statusCode?: number };
    error.statusCode = 400;
    mocks.verifyEmailChangeService.mockRejectedValue(error);

    const response = await request(app)
      .post("/api/user/email/change/verify")
      .send({
        otp: "123456",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid OTP");
  });
});
