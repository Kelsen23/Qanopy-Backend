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

const { default: handleContentModerationBan } = await import(
  "../../../../src/services/moderation/ai/handleContentModerationBan.service.js"
);
const { default: handleContentModerationWarn } = await import(
  "../../../../src/services/moderation/ai/handleContentModerationWarn.service.js"
);
const { default: handleContentModerationIgnore } = await import(
  "../../../../src/services/moderation/ai/handleContentModerationIgnore.service.js"
);

describe("moderation AI handlers", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    mockRandomUUID.mockReset().mockReturnValue("decision_1");
  });

  it("creates strike, metrics, audit, notification, cache clearing, and ban notice for AI temp bans", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      null,
    );
    moderationUnitTestEnvironment.applyContentModerationDecision.mockResolvedValueOnce(
      {
        applied: true,
      },
    );

    await handleContentModerationBan({
      contentId: "question_1",
      contentType: "QUESTION",
      versionOrRevision: 4,
      finalDecision: "BAN_TEMP",
      aiConfidence: 0.95,
      aiReasons: [
        "Your content appears to contain insults, abusive language, or targeted harassment directed at another person.",
      ],
      severity: 4,
      riskScore: 4.2,
      tempBanDurationMs: 7200,
      baseMeta: { source: "ai" },
      decisionId: "decision_1",
      content: {
        userId: "user_1",
      },
    });

    expect(moderationUnitTestEnvironment.applyUserBan).toHaveBeenCalled();
    expect(moderationUnitTestEnvironment.clearUserCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(
      moderationUnitTestEnvironment.moderationMetricsQueueAdd,
    ).toHaveBeenCalledWith(
      "BAN_TEMP",
      {
        userId: "user_1",
        reviewedBy: "AI_MODERATION",
      },
      expect.objectContaining({
        jobId: "moderationMetrics__decision_1__BAN_TEMP",
      }),
    );
    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).toHaveBeenCalled();
    expect(
      moderationUnitTestEnvironment.routeNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user_1",
        event: "STRIKE",
      }),
    );
    expect(
      moderationUnitTestEnvironment.clearModeratedContentCache,
    ).toHaveBeenCalledWith("QUESTION", "question_1", 4);
    expect(
      moderationUnitTestEnvironment.sendUnbanNoticeEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        actionTaken: "BAN_TEMP",
      }),
    );
  });

  it("reverts newly created strikes when moderation decision application loses the race", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      null,
    );
    moderationUnitTestEnvironment.applyContentModerationDecision.mockResolvedValueOnce(
      {
        applied: false,
      },
    );

    await handleContentModerationBan({
      contentId: "question_1",
      contentType: "QUESTION",
      versionOrRevision: 4,
      finalDecision: "BAN_PERM",
      aiConfidence: 0.95,
      aiReasons: ["Violence"],
      severity: 4,
      riskScore: 7.1,
      tempBanDurationMs: 7200,
      baseMeta: {},
      decisionId: "decision_1",
      content: {
        userId: "user_1",
      },
    });

    expect(
      moderationUnitTestEnvironment.prismaModerationStrikeDeleteMany,
    ).toHaveBeenCalled();
    expect(moderationUnitTestEnvironment.clearStrikesCache).toHaveBeenCalled();
  });

  it("creates warnings and question pipeline jobs for WARN decisions", async () => {
    moderationUnitTestEnvironment.applyContentModerationDecision.mockResolvedValueOnce(
      {
        applied: true,
      },
    );
    moderationUnitTestEnvironment.prismaWarningCreate.mockResolvedValueOnce({
      id: "warning_1",
    });

    await handleContentModerationWarn({
      contentId: "question_1",
      contentType: "QUESTION",
      versionOrRevision: 4,
      aiReasons: ["Harassment"],
      severity: 2,
      baseMeta: { source: "ai" },
      decisionId: "decision_1",
      content: {
        userId: "user_1",
      },
    });

    expect(
      moderationUnitTestEnvironment.prismaWarningCreate,
    ).toHaveBeenCalled();
    expect(
      moderationUnitTestEnvironment.contentPipelineRouterAdd,
    ).toHaveBeenCalledWith(
      "QUESTION",
      {
        contentId: "question_1",
        version: 4,
      },
      expect.objectContaining({
        jobId: "contentPipelineRoute__question_1__4",
      }),
    );
    expect(
      moderationUnitTestEnvironment.moderationMetricsQueueAdd,
    ).toHaveBeenCalledWith(
      "WARN",
      {
        userId: "user_1",
        reviewedBy: "AI_MODERATION",
      },
      expect.objectContaining({
        jobId: "moderationMetrics__decision_1__WARN",
      }),
    );
  });

  it("creates audit, pipeline, and metrics jobs for IGNORE decisions when application succeeds", async () => {
    moderationUnitTestEnvironment.applyContentModerationDecision.mockResolvedValueOnce(
      {
        applied: true,
      },
    );

    await handleContentModerationIgnore({
      contentId: "question_1",
      contentType: "QUESTION",
      versionOrRevision: 4,
      baseMeta: { source: "ai" },
      decisionId: "decision_1",
      content: {
        userId: "user_1",
      },
    });

    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).toHaveBeenCalledWith(
      "MOD_ACTION_LOG",
      expect.objectContaining({
        actionTaken: "IGNORE",
      }),
      expect.objectContaining({
        jobId: "moderationAudit__decision_1__IGNORE",
      }),
    );
    expect(
      moderationUnitTestEnvironment.contentPipelineRouterAdd,
    ).toHaveBeenCalled();
    expect(
      moderationUnitTestEnvironment.moderationMetricsQueueAdd,
    ).toHaveBeenCalledWith(
      "IGNORE",
      {
        userId: "user_1",
        reviewedBy: "AI_MODERATION",
      },
      expect.objectContaining({
        jobId: "moderationMetrics__decision_1__IGNORE",
      }),
    );
  });
});
