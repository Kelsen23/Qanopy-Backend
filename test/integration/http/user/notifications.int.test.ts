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
  getNotificationSettingsService: vi.fn(),
  updateNotificationSettingsService: vi.fn(),
  markNotificationsAsSeenService: vi.fn(),
}));

vi.mock("../../../../src/services/user/user.service.js", () => ({
  ...createUserServiceModuleMock({
    getNotificationSettings: mocks.getNotificationSettingsService,
    updateNotificationSettings: mocks.updateNotificationSettingsService,
    markNotificationsAsSeen: mocks.markNotificationsAsSeenService,
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

const validSettings = {
  upvote: true,
  downvote: false,
  answerCreated: true,
  replyCreated: false,
  answerAccepted: true,
  answerMarkedBest: false,
  aiSuggestionUnlocked: true,
  aiAnswerUnlocked: false,
  similarQuestionsReady: true,
};

describe("GET /api/user/notifications/settings", () => {
  beforeEach(() => {
    mocks.getNotificationSettingsService.mockReset();
    mocks.updateNotificationSettingsService.mockReset();
    mocks.markNotificationsAsSeenService.mockReset();
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

  it("returns notification settings", async () => {
    mocks.getNotificationSettingsService.mockResolvedValue({
      settings: validSettings,
    });

    const response = await request(app).get("/api/user/notifications/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully received notification settings",
      settings: validSettings,
    });
    expect(mocks.getNotificationSettingsService).toHaveBeenCalledWith({
      userId: "user_1",
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).get("/api/user/notifications/settings");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app).get("/api/user/notifications/settings");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).get("/api/user/notifications/settings");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Notification settings not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.getNotificationSettingsService.mockRejectedValue(error);

    const response = await request(app).get("/api/user/notifications/settings");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Notification settings not found");
  });
});

describe("PUT /api/user/notifications/settings", () => {
  beforeEach(() => {
    mocks.getNotificationSettingsService.mockReset();
    mocks.updateNotificationSettingsService.mockReset();
    mocks.markNotificationsAsSeenService.mockReset();
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

  it("updates notification settings successfully", async () => {
    mocks.updateNotificationSettingsService.mockResolvedValue({
      settings: validSettings,
    });

    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send(validSettings);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Notification settings updated successfully",
      settings: validSettings,
    });
    expect(mocks.updateNotificationSettingsService).toHaveBeenCalledWith({
      userId: "user_1",
      settings: validSettings,
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send({
        ...validSettings,
        upvote: "yes",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.updateNotificationSettingsService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send(validSettings);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send(validSettings);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send(validSettings);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error(
      "Notification settings could not be updated",
    ) as Error & {
      statusCode?: number;
    };
    error.statusCode = 500;
    mocks.updateNotificationSettingsService.mockRejectedValue(error);

    const response = await request(app)
      .put("/api/user/notifications/settings")
      .send(validSettings);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      "Notification settings could not be updated",
    );
  });
});

describe("PATCH /api/user/notifications/seen", () => {
  beforeEach(() => {
    mocks.getNotificationSettingsService.mockReset();
    mocks.updateNotificationSettingsService.mockReset();
    mocks.markNotificationsAsSeenService.mockReset();
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

  it("marks notifications as seen successfully", async () => {
    mocks.markNotificationsAsSeenService.mockResolvedValue({
      message: "Successfully marked notifications as seen",
    });

    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1", "notification_2"],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully marked notifications as seen",
    });
    expect(mocks.markNotificationsAsSeenService).toHaveBeenCalledWith({
      userId: "user_1",
      notificationIds: ["notification_1", "notification_2"],
    });
  });

  it("rejects empty notification id lists", async () => {
    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.markNotificationsAsSeenService).not.toHaveBeenCalled();
  });

  it("rejects oversized notification id lists", async () => {
    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: Array.from(
          { length: 101 },
          (_, index) => `id_${index}`,
        ),
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.markNotificationsAsSeenService).not.toHaveBeenCalled();
  });

  it("rejects non-string notification ids", async () => {
    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1", 2],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.markNotificationsAsSeenService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1"],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1"],
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1"],
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Notifications could not be updated") as Error & {
      statusCode?: number;
    };
    error.statusCode = 500;
    mocks.markNotificationsAsSeenService.mockRejectedValue(error);

    const response = await request(app)
      .patch("/api/user/notifications/seen")
      .send({
        notificationIds: ["notification_1"],
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Notifications could not be updated");
  });
});
