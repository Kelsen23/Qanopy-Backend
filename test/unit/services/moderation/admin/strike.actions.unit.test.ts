import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as env,
  resetModerationUnitTestEnvironment,
} from "../../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

vi.mock(
  "../../../../../src/config/prisma.config.js",
  () => mockModerationUnitModules.prismaConfig,
);
vi.mock(
  "../../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
);
vi.mock(
  "../../../../../src/utils/cache/clearCache.util.js",
  () => mockModerationUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../../src/utils/cache/clearUserCache.util.js",
  () => mockModerationUnitModules.clearUserCache,
);
vi.mock(
  "../../../../../src/utils/socket/publishSocketDisconnect.util.js",
  () => mockModerationUnitModules.publishSocketDisconnect,
);
vi.mock(
  "../../../../../src/queues/moderationMetrics.queue.js",
  () => mockModerationUnitModules.moderationMetricsQueue,
);
vi.mock(
  "../../../../../src/queues/moderationAudit.queue.js",
  () => mockModerationUnitModules.moderationAuditQueue,
);
vi.mock(
  "../../../../../src/services/notification/routeNotification.service.js",
  () => mockModerationUnitModules.routeNotificationService,
);
vi.mock(
  "../../../../../src/services/moderation/applyAdminContentModerationDecision.service.js",
  () => mockModerationUnitModules.applyAdminContentModerationDecisionService,
);
vi.mock(
  "../../../../../src/services/moderation/applyUserBan.service.js",
  () => mockModerationUnitModules.applyUserBanService,
);
vi.mock(
  "../../../../../src/services/moderation/removeModeratedContent.service.js",
  () => mockModerationUnitModules.removeModeratedContentService,
);
vi.mock(
  "../../../../../src/services/moderation/sendBanNoticeEmail.service.js",
  () => mockModerationUnitModules.sendBanNoticeEmailService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/runSideEffectWithRetry.service.js",
  () => mockModerationUnitModules.runSideEffectWithRetryService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/strike/assertStrikeClaimIsCurrent.service.js",
  () => mockModerationUnitModules.assertStrikeClaimIsCurrentService,
);

const { default: moderateStrikeBanTemp } = await import(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeBanTemp.service.js"
);
const { default: moderateStrikeBanPerm } = await import(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeBanPerm.service.js"
);
const { default: moderateStrikeWarn } = await import(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeWarn.service.js"
);
const { default: moderateStrikeIgnore } = await import(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeIgnore.service.js"
);

const context = {
  strikeId: "strike_1",
  targetUserId: "user_1",
  targetUserExists: true,
  targetContentId: "question_1",
  targetType: "QUESTION" as const,
  targetContentVersion: 3,
  reviewedBy: "admin_1",
  reviewComment: "reviewed",
  actionTaken: "BAN_TEMP" as const,
  title: "Temp ban",
  reasons: ["Spam"],
  decisionId: "decision_1",
  claimToken: "claim_1",
  originalAiDecision: "WARN",
  originalAiConfidence: 0.8,
  originalAiReasons: ["Spam"],
  severity: 3,
  riskScore: 5.5,
};

describe("moderation admin strike action services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
  });

  it("handles BAN_TEMP strike moderation with content moderation, removal, ban, audit, disconnect, and email", async () => {
    env.removeModeratedContent.mockResolvedValueOnce({
      removed: true,
      message: "removed",
    });

    await moderateStrikeBanTemp("Temp ban", ["Spam"], 3600, context, {
      exists: true,
      isActive: true,
      isDeleted: false,
      ownerMatches: true,
      canRemove: true,
    });

    expect(env.applyAdminContentModerationDecision).toHaveBeenCalledWith(
      "question_1",
      "QUESTION",
      "REJECTED",
      3,
    );
    expect(env.removeModeratedContent).toHaveBeenCalledWith(
      "QUESTION",
      "question_1",
      3,
    );
    expect(env.applyUserBan).toHaveBeenCalled();
    expect(env.moderationAuditQueueAdd).toHaveBeenCalled();
    expect(env.publishSocketDisconnect).toHaveBeenCalledWith("user_1");
    expect(env.sendBanNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        actionTaken: "BAN_TEMP",
      }),
    );
  });

  it("handles BAN_PERM strike moderation with permanent ban and content removal audit", async () => {
    env.removeModeratedContent.mockResolvedValueOnce({
      removed: true,
      message: "removed",
    });

    await moderateStrikeBanPerm(
      "Perm ban",
      ["Severe abuse"],
      {
        ...context,
        actionTaken: "BAN_PERM",
      },
      {
        exists: true,
        isActive: true,
        isDeleted: false,
        ownerMatches: true,
        canRemove: true,
      },
    );

    expect(env.applyUserBan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        banType: "PERM",
      }),
    );
    expect(env.moderationAuditQueueAdd).toHaveBeenCalledWith(
      "REMOVE_CONTENT",
      expect.objectContaining({
        actionTaken: "REMOVE",
      }),
      expect.anything(),
    );
    expect(env.sendBanNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        actionTaken: "BAN_PERM",
      }),
    );
  });

  it("handles WARN strike moderation with warning creation and notification", async () => {
    await moderateStrikeWarn(
      "Warn",
      ["Abuse"],
      7200,
      {
        ...context,
        actionTaken: "WARN",
      },
      {
        exists: true,
        isActive: true,
        isDeleted: false,
        ownerMatches: true,
        canRemove: false,
      },
    );

    expect(env.prismaWarningCreate).toHaveBeenCalled();
    expect(env.applyAdminContentModerationDecision).toHaveBeenCalledWith(
      "question_1",
      "QUESTION",
      "FLAGGED",
      3,
    );
    expect(env.routeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user_1",
        event: "WARN",
      }),
    );
  });

  it("handles IGNORE strike moderation with approved content status and strike cache clear", async () => {
    await moderateStrikeIgnore(
      "Ignore",
      ["No issue"],
      {
        ...context,
        actionTaken: "IGNORE",
      },
      {
        exists: true,
        isActive: true,
        isDeleted: false,
        ownerMatches: true,
        canRemove: false,
      },
    );

    expect(env.applyAdminContentModerationDecision).toHaveBeenCalledWith(
      "question_1",
      "QUESTION",
      "APPROVED",
      3,
    );
    expect(env.moderationAuditQueueAdd).toHaveBeenCalledWith(
      "UPDATE_STRIKE_STATUS",
      expect.objectContaining({
        actionTaken: "IGNORE",
      }),
      expect.anything(),
    );
    expect(env.clearStrikesCache).toHaveBeenCalled();
  });
});
