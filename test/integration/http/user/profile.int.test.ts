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

  it("cleans profile fields through zod before calling the service", async () => {
    mocks.updateProfileService.mockResolvedValue({
      user: {
        id: "user_1",
        displayName: "Alice Smith",
        bio: "I help with TypeScript.",
      },
    });

    const response = await request(app).patch("/api/user/profile").send({
      displayName: "  Ａlice\u200b\tSmith  ",
      bio: "  I help\u200b with\nTypeScript.  ",
    });

    expect(response.status).toBe(200);
    expect(mocks.updateProfileService).toHaveBeenCalledWith({
      userId: "user_1",
      displayName: "Alice Smith",
      bio: "I help with TypeScript.",
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

  it("rejects unsafe profile fields at zod validation", async () => {
    const response = await request(app).patch("/api/user/profile").send({
      displayName: "Qanopy Staff",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(response.body.errors[0].message).toBe("Display name is reserved");
    expect(mocks.updateProfileService).not.toHaveBeenCalled();
  });

  it("rejects cussing hidden inside display name tokens", async () => {
    const response = await request(app).patch("/api/user/profile").send({
      displayName: "sh1t_user",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(response.body.errors[0].message).toBe(
      "Display name contains inappropriate language",
    );
    expect(mocks.updateProfileService).not.toHaveBeenCalled();
  });

  it("rejects bios longer than the database limit", async () => {
    const response = await request(app)
      .patch("/api/user/profile")
      .send({ bio: "a".repeat(151) });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(response.body.errors[0].message).toBe(
      "Bio must be at most 150 characters",
    );
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
