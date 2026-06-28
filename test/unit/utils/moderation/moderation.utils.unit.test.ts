import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as env,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

const moderationCreate = vi.fn();
const s3Send = vi.fn();
const rekognitionSend = vi.fn();

vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockModerationUnitModules.redisConfig,
);
vi.mock(
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/services/notification/routeNotification.service.js",
  () => mockModerationUnitModules.routeNotificationService,
);
vi.mock("../../../../src/config/openai.config.js", () => ({
  moderationClient: {
    moderations: {
      create: moderationCreate,
    },
  },
}));
vi.mock("../../../../src/config/s3.config.js", () => ({
  default: () => ({
    send: s3Send,
  }),
  accessKey: "key",
  secretAccessKey: "secret",
  bucketName: "bucket",
  bucketRegion: "us-east-1",
}));
vi.mock(
  "../../../../src/models/question.model.js",
  () => mockModerationUnitModules.questionModel,
);
vi.mock(
  "../../../../src/models/answer.model.js",
  () => mockModerationUnitModules.answerModel,
);
vi.mock(
  "../../../../src/models/reply.model.js",
  () => mockModerationUnitModules.replyModel,
);
vi.mock("../../../../src/models/aiAnswer.model.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));
vi.mock(
  "../../../../src/models/aiAnswerFeedback.model.js",
  () => mockModerationUnitModules.aiAnswerFeedbackModel,
);
vi.mock(
  "../../../../src/utils/cache/clearCache.util.js",
  () => mockModerationUnitModules.clearCacheUtil,
);
vi.mock("@aws-sdk/client-rekognition", () => ({
  Rekognition: function Rekognition() {
    return {
      send: rekognitionSend,
    };
  },
  DetectModerationLabelsCommand: function DetectModerationLabelsCommand(
    input: unknown,
  ) {
    return input;
  },
}));
vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: function DeleteObjectCommand(input: unknown) {
    return input;
  },
}));

const { buildAiModerationPolicy, isLowConfidenceHighRiskCategory } =
  await import("../../../../src/services/moderation/ai/aiModeration.policy.js");
const { default: aiModerateContent } = await import(
  "../../../../src/services/moderation/ai/aiModeration.service.js"
);
const { checkAdminModPointsLimit, addAdminModPoints } = await import(
  "../../../../src/services/moderation/modPoints.service.js"
);
const { default: moderateFile } = await import(
  "../../../../src/services/moderation/fileModeration.service.js"
);
const { default: buildAiModerationNotificationMeta } = await import(
  "../../../../src/utils/moderation/aiModerationNotificationMeta.util.js"
);
const { default: calculateTempBanMs } = await import(
  "../../../../src/utils/moderation/calculateTempBanMs.util.js"
);
const { default: computeRiskScore } = await import(
  "../../../../src/utils/moderation/computeRiskScore.util.js"
);
const { formatBanDurationBreakdown, formatBanNoticeExpiryUtc } = await import(
  "../../../../src/utils/moderation/formatBanNotice.util.js"
);

describe("moderation utils", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    moderationCreate.mockReset();
    s3Send.mockReset();
    rekognitionSend.mockReset();
  });

  it("builds a permanent-ban AI moderation policy for high-risk categories", () => {
    const result = buildAiModerationPolicy({
      flagged: true,
      category_scores: {
        "sexual/minors": 0.9,
        harassment: 0.4,
      },
    });

    expect(result.recommendedAction).toBe("BAN_PERM");
    expect(result.primaryCategory).toBe("sexual/minors");
    expect(isLowConfidenceHighRiskCategory("sexual/minors", 0.2)).toBe(true);
  });

  it("normalizes AI moderation API success responses", async () => {
    moderationCreate.mockResolvedValueOnce({
      results: [
        {
          flagged: true,
          category_scores: {
            harassment: 0.8,
          },
        },
      ],
    });

    const result = await aiModerateContent("abusive content");

    expect(moderationCreate).toHaveBeenCalledWith({
      model: "omni-moderation-latest",
      input: "abusive content",
    });
    expect(result).toMatchObject({
      ok: true,
      flagged: true,
      primaryCategory: "harassment",
    });
  });

  it("returns a failure result when the moderation API throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    moderationCreate.mockRejectedValueOnce(new Error("api down"));

    const result = await aiModerateContent("content");

    expect(result).toEqual({
      ok: false,
      error: "api down",
    });
    consoleError.mockRestore();
  });

  it("enforces moderation point cooldowns and adds points through redis eval", async () => {
    env.redisGet.mockResolvedValueOnce("30");

    await expect(checkAdminModPointsLimit("admin_1")).rejects.toMatchObject({
      message: "Slow down. Moderation cooldown active",
      statusCode: 429,
    });

    await addAdminModPoints("admin_1", "BAN_TEMP");

    expect(env.redisEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "admin:admin_1:mod_points",
      5,
      120,
    );
  });

  it("builds notification meta and computes risk and temp ban durations", () => {
    expect(
      buildAiModerationNotificationMeta({
        action: "BAN_TEMP",
        reasons: ["Spam"],
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).toEqual({
      actionTaken: "BAN_TEMP",
      reasons: ["Spam"],
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(computeRiskScore(0.9, 90, 2, 0.5)).toBeLessThanOrEqual(10);
    expect(calculateTempBanMs(70, 0.8, 0, 1)).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000,
    );
  });

  it("formats ban durations and expiry timestamps", () => {
    expect(formatBanDurationBreakdown(90 * 60 * 1000)).toBe(
      "1 hour, 30 minutes",
    );
    expect(formatBanDurationBreakdown(0)).toBe("Temporary");
    expect(
      formatBanNoticeExpiryUtc(new Date("2030-01-02T03:04:05.000Z")),
    ).toContain("UTC");
  });

  it("deactivates moderated content by type", async () => {
    const questionUpdateOne = vi.fn(async () => undefined);
    const answerUpdateOne = vi.fn(async () => undefined);
    const replyUpdateOne = vi.fn(async () => undefined);

    vi.resetModules();
    vi.doMock("../../../../src/models/question.model.js", () => ({
      default: { updateOne: questionUpdateOne },
    }));
    vi.doMock("../../../../src/models/answer.model.js", () => ({
      default: { updateOne: answerUpdateOne },
    }));
    vi.doMock("../../../../src/models/reply.model.js", () => ({
      default: { updateOne: replyUpdateOne },
    }));

    const { default: deactivateContentReloaded } = await import(
      "../../../../src/utils/moderation/deactivateContent.util.js"
    );

    await deactivateContentReloaded("QUESTION", "question_1");
    await deactivateContentReloaded("ANSWER", "answer_1");
    await deactivateContentReloaded("REPLY", "reply_1");

    expect(questionUpdateOne).toHaveBeenCalledWith(
      { _id: "question_1", isActive: true },
      { isActive: false },
    );
    expect(answerUpdateOne).toHaveBeenCalledWith(
      { _id: "answer_1", isActive: true },
      { isActive: false },
    );
    expect(replyUpdateOne).toHaveBeenCalledWith(
      { _id: "reply_1", isActive: true },
      { isActive: false },
    );

    vi.resetModules();
  });

  it("deletes unsafe files and notifies the user", async () => {
    rekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [{ Name: "Explicit Nudity" }],
    });
    s3Send.mockResolvedValueOnce({});

    const result = await moderateFile(
      "user_1",
      "uploads/img.png",
      "PROFILE_PICTURE",
    );

    expect(s3Send).toHaveBeenCalled();
    expect(env.routeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user_1",
        event: "REMOVE_CONTENT",
      }),
    );
    expect(result).toEqual({ safe: false });
  });

  it("returns deleted false for unsafe content images when object deletion fails", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    rekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [{ Name: "Explicit Nudity" }],
    });
    s3Send.mockRejectedValueOnce(new Error("s3 down"));

    const result = await moderateFile(
      "user_1",
      "uploads/img.png",
      "CONTENT_IMAGE",
    );

    expect(result).toEqual({
      safe: false,
      deleted: false,
    });
    consoleWarn.mockRestore();
  });
});
