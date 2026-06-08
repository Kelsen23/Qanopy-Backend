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
  updateProfileService: vi.fn(),
}));

vi.mock("../../../../src/services/user/user.service.js", () => ({
  ...createUserServiceModuleMock({
    updateProfile: mocks.updateProfileService,
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

describe("PATCH /api/user/profile", () => {
  beforeEach(() => {
    mocks.updateProfileService.mockReset();
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

  it("updates the profile successfully", async () => {
    mocks.updateProfileService.mockResolvedValue({
      user: {
        id: "user_1",
        displayName: "Updated User",
        bio: "Updated bio",
      },
    });

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Updated User",
      bio: "Updated bio",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully updated profile",
      user: {
        id: "user_1",
        displayName: "Updated User",
        bio: "Updated bio",
      },
    });
    expect(mocks.updateProfileService).toHaveBeenCalledWith({
      userId: "user_1",
      displayName: "Updated User",
      bio: "Updated bio",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).patch("/api/user/profile").send({
      displayName: "ab",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.updateProfileService).not.toHaveBeenCalled();
  });

  it("rejects payloads when no updatable fields are provided", async () => {
    const response = await request(app).patch("/api/user/profile").send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.updateProfileService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Updated User",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Updated User",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Updated User",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Display name already in use") as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    mocks.updateProfileService.mockRejectedValue(error);

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Updated User",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Display name already in use");
  });
});
