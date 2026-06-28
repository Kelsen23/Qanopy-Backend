import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createModerationTestApp } from "../../../helpers/createTestApp.js";
import {
  createMockAuthMiddlewareModule,
  mockAuthContextState,
  resetMockAuthContextState,
} from "../../../helpers/auth/mockAuthContext.js";
import { createModerationServiceModuleMock } from "../../../helpers/moderation/createModerationServiceModuleMock.js";
import { mockModerationLimiters } from "../../../helpers/moderation/mockModerationLimiters.js";

const mocks = vi.hoisted(() => ({
  getBanService: vi.fn(),
  unbanUserService: vi.fn(),
}));

vi.mock("../../../../src/services/moderation/moderation.service.js", () => ({
  ...createModerationServiceModuleMock({
    getBan: mocks.getBanService,
    unbanUser: mocks.unbanUserService,
  }),
}));

vi.mock(
  "../../../../src/middlewares/rate-limiters/moderation.rate-limiters.js",
  () => mockModerationLimiters,
);

vi.mock("../../../../src/middlewares/auth.middleware.js", () =>
  createMockAuthMiddlewareModule(),
);

const app = await createModerationTestApp();

describe("PATCH /api/moderation/ban/remove", () => {
  beforeEach(() => {
    mocks.getBanService.mockReset();
    mocks.unbanUserService.mockReset();
    resetMockAuthContextState();
    mockAuthContextState.authenticated = true;
    mockAuthContextState.user = {
      id: "admin_1",
      tokenVersion: 0,
      status: "ACTIVE",
      isVerified: true,
      role: "ADMIN",
      isDeleted: false,
    };
  });

  it("removes active bans successfully", async () => {
    mocks.unbanUserService.mockResolvedValue({
      message: "Successfully removed active bans",
      deactivatedBanCount: 2,
    });

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully removed active bans",
      deactivatedBanCount: 2,
    });
    expect(mocks.unbanUserService).toHaveBeenCalledWith({
      userId: "user_2",
      reviewedBy: "admin_1",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.unbanUserService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("rejects non-admin users", async () => {
    mockAuthContextState.user.role = "USER";

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User forbidden accessing this route");
  });

  it("returns service errors", async () => {
    const error = new Error("User has no active bans") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.unbanUserService.mockRejectedValue(error);

    const response = await request(app)
      .patch("/api/moderation/ban/remove")
      .send({ userId: "user_2" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User has no active bans");
  });
});

describe("GET /api/moderation/ban/active", () => {
  beforeEach(() => {
    mocks.getBanService.mockReset();
    mocks.unbanUserService.mockReset();
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

  it("returns the active ban", async () => {
    mocks.getBanService.mockResolvedValue({
      message: "Successfully received ban",
      ban: {
        id: "ban_1",
        reason: "Repeated violations",
        isActive: true,
      },
    });

    const response = await request(app).get("/api/moderation/ban/active");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully received ban",
      ban: {
        id: "ban_1",
        reason: "Repeated violations",
        isActive: true,
      },
    });
    expect(mocks.getBanService).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("returns no active ban", async () => {
    mocks.getBanService.mockResolvedValue({
      message: "Active ban not found",
      ban: null,
    });

    const response = await request(app).get("/api/moderation/ban/active");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Active ban not found",
      ban: null,
    });
    expect(mocks.getBanService).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).get("/api/moderation/ban/active");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("returns service errors", async () => {
    const error = new Error("Ban lookup failed") as Error & {
      statusCode?: number;
    };
    error.statusCode = 500;
    mocks.getBanService.mockRejectedValue(error);

    const response = await request(app).get("/api/moderation/ban/active");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Ban lookup failed");
  });
});
