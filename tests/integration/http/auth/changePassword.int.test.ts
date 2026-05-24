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
  changePasswordService: vi.fn(),
}));

vi.mock("../../../../src/services/auth/auth.service.js", () => ({
  ...createAuthServiceModuleMock({
    changePassword: mocks.changePasswordService,
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

describe("POST /api/auth/password/change", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    mocks.changePasswordService.mockReset();
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

  it("changes the password successfully", async () => {
    mocks.changePasswordService.mockResolvedValue({
      user: {
        id: "user_1",
        tokenVersion: 1,
      },
    });

    const response = await request(app).post("/api/auth/password/change").send({
      currentPassword: "Password1!",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully changed your password",
    });
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(mocks.changePasswordService).toHaveBeenCalledWith({
      userId: "user_1",
      currentPassword: "Password1!",
      newPassword: "Password2!",
    });
  });

  it("rejects invalid current passwords", async () => {
    const error = new Error("Invalid current password") as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    mocks.changePasswordService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/change").send({
      currentPassword: "WrongPassword1!",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid current password");
  });

  it("rejects reusing the same password", async () => {
    const error = new Error(
      "New password must be different from the old password",
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    mocks.changePasswordService.mockRejectedValue(error);

    const response = await request(app).post("/api/auth/password/change").send({
      currentPassword: "Password1!",
      newPassword: "Password1!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "New password must be different from the old password",
    );
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/auth/password/change").send({
      currentPassword: "Password1!",
      newPassword: "Password2!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/auth/password/change").send({
      currentPassword: "",
      newPassword: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.changePasswordService).not.toHaveBeenCalled();
  });
});
