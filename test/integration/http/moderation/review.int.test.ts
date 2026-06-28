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
  moderateService: vi.fn(),
}));

vi.mock("../../../../src/services/moderation/moderation.service.js", () => ({
  ...createModerationServiceModuleMock({
    moderate: mocks.moderateService,
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

describe("PATCH /api/moderation/review", () => {
  beforeEach(() => {
    mocks.moderateService.mockReset();
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

  it("moderates a report successfully", async () => {
    mocks.moderateService.mockResolvedValue({
      message: "Successfully moderated report",
    });

    const payload = {
      type: "REPORT",
      targetId: "report_1",
      actionTaken: "IGNORE",
      title: "Reviewed report",
      reasons: ["No violation found"],
      reviewComment: "Checked manually",
    };

    const response = await request(app)
      .patch("/api/moderation/review")
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully moderated report",
    });
    expect(mocks.moderateService).toHaveBeenCalledWith({
      userId: "admin_1",
      ...payload,
    });
  });

  it("moderates a strike successfully", async () => {
    mocks.moderateService.mockResolvedValue({
      message: "Successfully moderated strike",
    });

    const payload = {
      type: "STRIKE",
      targetId: "strike_1",
      actionTaken: "WARN",
      title: "Warning issued",
      reasons: ["Repeat minor violation"],
      reviewComment: "Warning added",
      warningDurationMs: 60 * 60 * 1000,
    };

    const response = await request(app)
      .patch("/api/moderation/review")
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Successfully moderated strike",
    });
    expect(mocks.moderateService).toHaveBeenCalledWith({
      userId: "admin_1",
      ...payload,
    });
  });

  it("rejects invalid payloads", async () => {
    const response = await request(app).patch("/api/moderation/review").send({
      type: "REPORT",
      targetId: "",
      actionTaken: "INVALID",
      title: "bad",
      reasons: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("requires banDurationMs for BAN_TEMP", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "BAN_TEMP",
        title: "Temporary ban",
        reasons: ["Clear violation"],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("rejects warningDurationMs for BAN_TEMP", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "BAN_TEMP",
        title: "Temporary ban",
        reasons: ["Clear violation"],
        banDurationMs: 60 * 60 * 1000,
        warningDurationMs: 60 * 60 * 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("requires warningDurationMs for WARN", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "STRIKE",
        targetId: "strike_1",
        actionTaken: "WARN",
        title: "Warning issued",
        reasons: ["Minor violation"],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("rejects banDurationMs for WARN", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "STRIKE",
        targetId: "strike_1",
        actionTaken: "WARN",
        title: "Warning issued",
        reasons: ["Minor violation"],
        warningDurationMs: 60 * 60 * 1000,
        banDurationMs: 60 * 60 * 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("rejects banDurationMs for non-BAN_TEMP actions", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
        banDurationMs: 60 * 60 * 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("rejects warningDurationMs for non-WARN actions", async () => {
    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
        warningDurationMs: 60 * 60 * 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation Failed");
    expect(mocks.moderateService).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthContextState.authenticated = false;
    mockAuthContextState.authError = {
      status: 400,
      message: "Not authenticated, no token",
    };

    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Not authenticated, no token");
  });

  it("rejects unverified users", async () => {
    mockAuthContextState.user.isVerified = false;

    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not verified");
  });

  it("rejects inactive users", async () => {
    mockAuthContextState.user.status = "BANNED";

    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User not active");
  });

  it("rejects non-admin users", async () => {
    mockAuthContextState.user.role = "USER";

    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("User forbidden accessing this route");
  });

  it("returns service errors", async () => {
    const error = new Error("Moderation target not found") as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    mocks.moderateService.mockRejectedValue(error);

    const response = await request(app)
      .patch("/api/moderation/review")
      .send({
        type: "REPORT",
        targetId: "report_1",
        actionTaken: "IGNORE",
        title: "Ignore report",
        reasons: ["No issue found"],
      });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Moderation target not found");
  });
});
