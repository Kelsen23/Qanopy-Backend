import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createAuthTestApp } from "../../../helpers/createTestApp.js";
import { createAuthServiceModuleMock } from "../../../helpers/auth/createAuthServiceModuleMock.js";
import {
  createMockGetDeviceInfoModule,
  defaultMockDeviceInfo,
} from "../../../helpers/mockGetDeviceInfo.js";
import { mockAuthLimiters } from "../../../helpers/auth/mockAuthLimiters.js";
import { mockAuthMiddlewares } from "../../../helpers/auth/mockAuthMiddlewares.js";

const mocks = vi.hoisted(() => ({
  registerService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    register: mocks.registerService,
  }),
}));

vi.mock("../../../../src/utils/auth/getDeviceInfo.util.js", () =>
  createMockGetDeviceInfoModule(defaultMockDeviceInfo),
);

vi.mock(
  "../../../../src/middlewares/rate-limiters/auth.rate-limiters.js",
  () => mockAuthLimiters,
);

vi.mock(
  "../../../../src/middlewares/auth.middleware.js",
  () => mockAuthMiddlewares,
);

const app = await createAuthTestApp();

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.registerService.mockReset();
  });

  it("registers a user and sets the auth cookie", async () => {
    mocks.registerService.mockResolvedValue({
      user: {
        id: "user_1",
        tokenVersion: 0,
        username: "testUser",
        email: "test@example.com",
        isVerified: false,
      },
      otpExpireAt: new Date("2026-01-01T00:00:00.000Z"),
      otpResendAvailableAt: new Date("2026-01-01T00:00:30.000Z"),
    });

    const response = await request(app).post("/api/auth/register").send({
      username: "testUser",
      email: "test@example.com",
      password: "Password1!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully registered",
      user: {
        username: "testUser",
        email: "test@example.com",
        otpExpireAt: "2026-01-01T00:00:00.000Z",
        otpResendAvailableAt: "2026-01-01T00:00:30.000Z",
        isVerified: false,
      },
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.registerService).toHaveBeenCalledWith({
      username: "testUser",
      email: "test@example.com",
      password: "Password1!",
      deviceInfo: {
        browser: "Chrome",
        os: "Linux",
        ip: "127.0.0.1",
      },
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: "tu",
      email: "not-an-email",
      password: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.registerService).not.toHaveBeenCalled();
  });
});
