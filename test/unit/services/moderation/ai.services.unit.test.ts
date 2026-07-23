import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

const mockRandomUUID = vi.fn<() => string>().mockReturnValue("decision_1");
const contentTypeEnum = {
  QUESTION: "QUESTION",
  ANSWER: "ANSWER",
  REPLY: "REPLY",
  AI_ANSWER_FEEDBACK: "AI_ANSWER_FEEDBACK",
};

vi.mock("crypto", () => ({
  default: {
    randomUUID: mockRandomUUID,
  },
}));
vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockModerationUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/models/question.model.js",
  () => mockModerationUnitModules.questionModel,
);
vi.mock(
  "../../../../src/models/questionVersion.model.js",
  () => mockModerationUnitModules.questionVersionModel,
);
vi.mock(
  "../../../../src/models/answer.model.js",
  () => mockModerationUnitModules.answerModel,
);
vi.mock(
  "../../../../src/models/reply.model.js",
  () => mockModerationUnitModules.replyModel,
);
vi.mock(
  "../../../../src/models/aiAnswerFeedback.model.js",
  () => mockModerationUnitModules.aiAnswerFeedbackModel,
);
vi.mock(
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/cache/clearCache.util.js",
  () => mockModerationUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/utils/cache/clearUserCache.util.js",
  () => mockModerationUnitModules.clearUserCache,
);
vi.mock(
  "../../../../src/utils/moderation/clearModeratedContentCache.util.js",
  () => mockModerationUnitModules.clearModeratedContentCache,
);
vi.mock(
  "../../../../src/utils/moderation/aiModerationNotificationMeta.util.js",
  () => mockModerationUnitModules.aiModerationNotificationMetaUtil,
);
vi.mock(
  "../../../../src/utils/moderation/computeRiskScore.util.js",
  () => mockModerationUnitModules.computeRiskScoreUtil,
);
vi.mock(
  "../../../../src/utils/moderation/calculateTempBanMs.util.js",
  () => mockModerationUnitModules.calculateTempBanMsUtil,
);
vi.mock(
  "../../../../src/services/moderation/ai/aiModeration.service.js",
  () => mockModerationUnitModules.aiModerationService,
);
vi.mock(
  "../../../../src/services/moderation/ai/loadModerationContent.service.js",
  () => mockModerationUnitModules.loadModerationContentService,
);
vi.mock(
  "../../../../src/services/moderation/ai/handleContentModerationBan.service.js",
  () => mockModerationUnitModules.handleContentModerationBanService,
);
vi.mock(
  "../../../../src/services/moderation/ai/handleContentModerationWarn.service.js",
  () => mockModerationUnitModules.handleContentModerationWarnService,
);
vi.mock(
  "../../../../src/services/moderation/ai/handleContentModerationIgnore.service.js",
  () => mockModerationUnitModules.handleContentModerationIgnoreService,
);
vi.mock(
  "../../../../src/services/moderation/applyContentModerationDecision.service.js",
  () => mockModerationUnitModules.applyContentModerationDecisionService,
);
vi.mock(
  "../../../../src/services/moderation/applyUserBan.service.js",
  () => mockModerationUnitModules.applyUserBanService,
);
vi.mock(
  "../../../../src/services/moderation/sendBanNoticeEmail.service.js",
  () => ({
    default: moderationUnitTestEnvironment.sendUnbanNoticeEmail,
  }),
);
vi.mock(
  "../../../../src/services/notification/routeNotification.service.js",
  () => mockModerationUnitModules.routeNotificationService,
);
vi.mock(
  "../../../../src/queues/moderationAudit.queue.js",
  () => mockModerationUnitModules.moderationAuditQueue,
);
vi.mock(
  "../../../../src/queues/moderationMetrics.queue.js",
  () => mockModerationUnitModules.moderationMetricsQueue,
);
vi.mock(
  "../../../../src/queues/contentPipelineRouter.queue.js",
  () => mockModerationUnitModules.contentPipelineRouterQueue,
);
vi.mock("../../../../src/generated/prisma/client.js", () => ({
  ContentType: contentTypeEnum,
}));

const { default: processContent } = await import(
  "../../../../src/services/moderation/ai/processContent.service.js"
);

describe("moderation AI services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    mockRandomUUID.mockReset().mockReturnValue("decision_1");
  });

  it("skips processing when content is missing, inactive, or already moderated", async () => {
    moderationUnitTestEnvironment.loadModerationContent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        contentType: "ANSWER",
        content: {
          userId: "user_1",
          body: "Body",
          moderationStatus: "PENDING",
          moderationRevision: 2,
          isActive: false,
        },
      })
      .mockResolvedValueOnce({
        contentType: "ANSWER",
        content: {
          userId: "user_1",
          body: "Body",
          moderationStatus: "APPROVED",
          moderationRevision: 2,
          isActive: true,
        },
      });

    await processContent("answer_1", "ANSWER", 2);
    await processContent("answer_1", "ANSWER", 2);
    await processContent("answer_1", "ANSWER", 2);

    expect(
      moderationUnitTestEnvironment.aiModerateContent,
    ).not.toHaveBeenCalled();
  });

  it("routes BAN decisions through the ban handler with computed risk and duration", async () => {
    moderationUnitTestEnvironment.loadModerationContent.mockResolvedValueOnce({
      contentType: "QUESTION",
      content: {
        userId: "user_1",
        title: "Need help",
        body: "Bad content",
        moderationStatus: "PENDING",
        currentVersion: 4,
      },
    });
    moderationUnitTestEnvironment.aiModerateContent.mockResolvedValueOnce({
      ok: true,
      confidence: 0.95,
      reasons: ["Violence"],
      severity: 4,
      recommendedAction: "WARN",
      flagged: true,
      primaryCategory: "violence",
    });
    moderationUnitTestEnvironment.prismaModerationStatsFindUnique.mockResolvedValueOnce(
      {
        totalStrikes: 2,
        trustScore: 0.4,
      },
    );
    moderationUnitTestEnvironment.computeRiskScore.mockReturnValueOnce(7.1);
    moderationUnitTestEnvironment.calculateTempBanMs.mockReturnValueOnce(7200);

    await processContent("question_1", "QUESTION", 4);

    expect(
      moderationUnitTestEnvironment.handleContentModerationBan,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        contentId: "question_1",
        contentType: "QUESTION",
        versionOrRevision: 4,
        finalDecision: "BAN_PERM",
        aiConfidence: 0.95,
        aiReasons: ["Violence"],
        severity: 4,
        riskScore: 7.1,
        tempBanDurationMs: 7200,
        decisionId: "decision_1",
      }),
    );
  });

  it("routes WARN and IGNORE decisions to their dedicated handlers", async () => {
    moderationUnitTestEnvironment.loadModerationContent
      .mockResolvedValueOnce({
        contentType: "ANSWER",
        content: {
          userId: "user_1",
          body: "Needs warning",
          moderationStatus: "PENDING",
          moderationRevision: 2,
          isActive: true,
        },
      })
      .mockResolvedValueOnce({
        contentType: "ANSWER",
        content: {
          userId: "user_1",
          body: "Safe content",
          moderationStatus: "PENDING",
          moderationRevision: 3,
          isActive: true,
        },
      });
    moderationUnitTestEnvironment.aiModerateContent
      .mockResolvedValueOnce({
        ok: true,
        confidence: 0.8,
        reasons: ["Harassment"],
        severity: 1,
        recommendedAction: "IGNORE",
        flagged: true,
        primaryCategory: "harassment",
      })
      .mockResolvedValueOnce({
        ok: true,
        confidence: 0.1,
        reasons: [],
        severity: 0,
        recommendedAction: "IGNORE",
        flagged: false,
        primaryCategory: null,
      });
    moderationUnitTestEnvironment.prismaModerationStatsFindUnique
      .mockResolvedValueOnce({
        totalStrikes: 0,
        trustScore: 1,
      })
      .mockResolvedValueOnce({
        totalStrikes: 0,
        trustScore: 1,
      });
    moderationUnitTestEnvironment.computeRiskScore
      .mockReturnValueOnce(1.2)
      .mockReturnValueOnce(0);

    await processContent("answer_1", "ANSWER", 2);
    await processContent("answer_1", "ANSWER", 3);

    expect(
      moderationUnitTestEnvironment.handleContentModerationWarn,
    ).toHaveBeenCalledTimes(1);
    expect(
      moderationUnitTestEnvironment.handleContentModerationIgnore,
    ).toHaveBeenCalledTimes(1);
  });

  it("throws when AI moderation is unavailable", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    moderationUnitTestEnvironment.loadModerationContent.mockResolvedValueOnce({
      contentType: "ANSWER",
      content: {
        userId: "user_1",
        body: "Body",
        moderationStatus: "PENDING",
        moderationRevision: 2,
        isActive: true,
      },
    });
    moderationUnitTestEnvironment.aiModerateContent.mockResolvedValueOnce({
      ok: false,
    });

    await expect(processContent("answer_1", "ANSWER", 2)).rejects.toThrow(
      "AI moderation unavailable",
    );

    warnSpy.mockRestore();
  });
});
