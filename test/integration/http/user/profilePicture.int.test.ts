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
  updateProfilePictureService: vi.fn(),
  deleteProfilePictureService: vi.fn(),
}));

vi.mock("../../../../src/services/user/user.service.js", () => ({
  ...createUserServiceModuleMock({
    updateProfilePicture: mocks.updateProfilePictureService,
    deleteProfilePicture: mocks.deleteProfilePictureService,
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

describe("PUT /api/user/picture", () => {
  beforeEach(() => {
    mocks.updateProfilePictureService.mockReset();
    mocks.deleteProfilePictureService.mockReset();
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

  it("updates the profile picture successfully", async () => {
    mocks.updateProfilePictureService.mockResolvedValue({
      message: "Successfully updated profile picture",
    });

    const response = await request(app).put("/api/user/picture").send({
      objectKey: "users/user_1/profile-picture.png",
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Successfully updated profile picture",
    });
    expect(mocks.updateProfilePictureService).toHaveBeenCalledWith({
      userId: "user_1",
      objectKey: "users/user_1/profile-picture.png",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).put("/api/user/picture").send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.updateProfilePictureService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).put("/api/user/picture").send({
      objectKey: "users/user_1/profile-picture.png",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app).put("/api/user/picture").send({
      objectKey: "users/user_1/profile-picture.png",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).put("/api/user/picture").send({
      objectKey: "users/user_1/profile-picture.png",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Profile picture upload not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.updateProfilePictureService.mockRejectedValue(error);

    const response = await request(app).put("/api/user/picture").send({
      objectKey: "users/user_1/profile-picture.png",
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Profile picture upload not found");
  });
});

describe("DELETE /api/user/picture", () => {
  beforeEach(() => {
    mocks.updateProfilePictureService.mockReset();
    mocks.deleteProfilePictureService.mockReset();
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

  it("deletes the profile picture successfully", async () => {
    mocks.deleteProfilePictureService.mockResolvedValue({
      profilePictureKey: null,
      profilePictureUrl: null,
    });

    const response = await request(app).delete("/api/user/picture");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Successfully deleted profile picture",
      profilePictureKey: null,
      profilePictureUrl: null,
    });
    expect(mocks.deleteProfilePictureService).toHaveBeenCalledWith("user_1");
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).delete("/api/user/picture");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app).delete("/api/user/picture");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).delete("/api/user/picture");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Profile picture not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.deleteProfilePictureService.mockRejectedValue(error);

    const response = await request(app).delete("/api/user/picture");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Profile picture not found");
  });
});
