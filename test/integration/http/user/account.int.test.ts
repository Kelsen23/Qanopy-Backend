import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createUserTestApp } from "../../../helpers/createTestApp.js";
import { createUserServiceModuleMock } from "../../../helpers/user/createUserServiceModuleMock.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/auth/mockAuthContext.js";
import { mockUserLimiters } from "../../../helpers/user/mockUserLimiters.js";

const mocks = vi.hoisted(() => ({
  deleteAccountService: vi.fn(),
}));

vi.mock("../../../../src/services/user/user.service.js", () => ({
  ...createUserServiceModuleMock({
    deleteAccount: mocks.deleteAccountService,
  }),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/user.rate-limiters.js",
  () => mockUserLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createUserTestApp();

describe("DELETE /api/user/account", () => {
  beforeEach(() => {
    mocks.deleteAccountService.mockReset();
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

  it("deletes the account successfully", async () => {
    mocks.deleteAccountService.mockResolvedValue({
      message: "Successfully deleted account",
    });

    const response = await request(app).delete("/api/user/account");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Successfully deleted account",
    });
    expect(mocks.deleteAccountService).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).delete("/api/user/account");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("returns service errors", async () => {
    const error = new Error("Account deletion is not allowed") as Error & {
      statusCode?: number;
    };
    error.statusCode = 403;
    mocks.deleteAccountService.mockRejectedValue(error);

    const response = await request(app).delete("/api/user/account");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Account deletion is not allowed");
  });
});
