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
  createReportService: vi.fn(),
}));

vi.mock("../../../../src/services/moderation/moderation.service.js", () => ({
  ...createModerationServiceModuleMock({
    createReport: mocks.createReportService,
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

describe("POST /api/moderation/report", () => {
  beforeEach(() => {
    mocks.createReportService.mockReset();
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

  it("creates a report successfully", async () => {
    mocks.createReportService.mockResolvedValue({
      report: {
        id: "report_1",
        reportedBy: "user_1",
        targetId: "question_1",
        targetContentVersion: 2,
        targetUserId: "user_2",
        targetType: "QUESTION",
        reportReason: "SPAM",
        reportComment: "Spam content",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    });

    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 2,
      reportReason: "SPAM",
      reportComment: "Spam content",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: "Report successfully created",
      report: {
        id: "report_1",
        reportedBy: "user_1",
        targetId: "question_1",
        targetContentVersion: 2,
        targetUserId: "user_2",
        targetType: "QUESTION",
        reportReason: "SPAM",
        reportComment: "Spam content",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    });
    expect(mocks.createReportService).toHaveBeenCalledWith({
      reportedBy: "user_1",
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 2,
      reportReason: "SPAM",
      reportComment: "Spam content",
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).post("/api/moderation/report").send({
      targetId: "",
      targetType: "INVALID",
      reportReason: "SPAM",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.createReportService).not.toHaveBeenCalled();
  });

  it("rejects question reports without targetContentVersion", async () => {
    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      reportReason: "SPAM",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.createReportService).not.toHaveBeenCalled();
  });

  it("rejects targetContentVersion for non-question reports", async () => {
    const response = await request(app).post("/api/moderation/report").send({
      targetId: "answer_1",
      targetType: "ANSWER",
      targetContentVersion: 1,
      reportReason: "SPAM",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.createReportService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 1,
      reportReason: "SPAM",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 1,
      reportReason: "SPAM",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 1,
      reportReason: "SPAM",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("returns service errors", async () => {
    const error = new Error("Target content not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.createReportService.mockRejectedValue(error);

    const response = await request(app).post("/api/moderation/report").send({
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 1,
      reportReason: "SPAM",
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Target content not found");
  });
});
