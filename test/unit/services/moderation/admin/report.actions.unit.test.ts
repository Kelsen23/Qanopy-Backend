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
  "../../../../../src/services/moderation/applyUserBan.service.js",
  () => mockModerationUnitModules.applyUserBanService,
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
  "../../../../../src/services/moderation/admin/report/assertReportClaimIsCurrent.service.js",
  () => mockModerationUnitModules.assertReportClaimIsCurrentService,
);
vi.mock(
  "../../../../../src/services/notification/routeNotification.service.js",
  () => mockModerationUnitModules.routeNotificationService,
);
vi.mock(
  "../../../../../src/services/moderation/applyAdminContentModerationDecision.service.js",
  () => mockModerationUnitModules.applyAdminContentModerationDecisionService,
);

const { default: moderateReportBanTemp } = await import(
  "../../../../../src/services/moderation/admin/report/moderateReportBanTemp.service.js"
);
const { default: moderateReportBanPerm } = await import(
  "../../../../../src/services/moderation/admin/report/moderateReportBanPerm.service.js"
);
const { default: moderateReportWarn } = await import(
  "../../../../../src/services/moderation/admin/report/moderateReportWarn.service.js"
);
const { default: moderateReportIgnore } = await import(
  "../../../../../src/services/moderation/admin/report/moderateReportIgnore.service.js"
);
const { default: applyAdminReportModerationDecision } = await import(
  "../../../../../src/services/moderation/admin/report/applyAdminReportModerationDecision.service.js"
);

const context = {
  reportId: "report_1",
  reportMongoId: "mongo_report_1",
  reportTargetUserId: "user_1",
  targetUserExists: true,
  reportContentId: "question_1",
  reportContentVersion: 3,
  targetType: "QUESTION" as const,
  reviewedBy: "admin_1",
  claimToken: "claim_1",
  decisionId: "decision_1",
  reporterUserId: "reporter_1",
};

const helpers = {
  updateReportStatus: vi.fn(async () => undefined),
  applyContentModerationStatus: vi.fn(async () => undefined),
  queueDeleteContentIfNeeded: vi.fn(async () => undefined),
};

describe("moderation admin report action services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    helpers.updateReportStatus.mockClear();
    helpers.applyContentModerationStatus.mockClear();
    helpers.queueDeleteContentIfNeeded.mockClear();
  });

  it("handles BAN_TEMP report moderation with user ban, cache clear, metrics, disconnect, and email", async () => {
    await moderateReportBanTemp("Temp ban", ["Spam"], 3600, context, helpers);

    expect(helpers.applyContentModerationStatus).toHaveBeenCalled();
    expect(helpers.queueDeleteContentIfNeeded).toHaveBeenCalled();
    expect(env.applyUserBan).toHaveBeenCalled();
    expect(env.clearUserCache).toHaveBeenCalledWith("user_1");
    expect(helpers.updateReportStatus).toHaveBeenCalledWith(
      "RESOLVED",
      "BAN_TEMP",
      expect.objectContaining({
        action: "BAN_TEMP",
        durationMs: 3600,
      }),
    );
    expect(env.moderationMetricsQueueAdd).toHaveBeenCalledWith(
      "BAN_TEMP",
      { userId: "user_1", reviewedBy: "ADMIN_MODERATION" },
      expect.objectContaining({
        jobId: "moderationMetrics__decision_1__BAN_TEMP",
      }),
    );
    expect(env.publishSocketDisconnect).toHaveBeenCalledWith("user_1");
    expect(env.sendBanNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        actionTaken: "BAN_TEMP",
      }),
    );
  });

  it("handles BAN_PERM report moderation and always sends the permanent ban notice", async () => {
    await moderateReportBanPerm("Perm ban", ["Severe abuse"], context, helpers);

    expect(env.applyUserBan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        banType: "PERM",
      }),
    );
    expect(helpers.updateReportStatus).toHaveBeenCalledWith(
      "RESOLVED",
      "BAN_PERM",
      expect.objectContaining({
        action: "BAN_PERM",
      }),
    );
    expect(env.sendBanNoticeEmail).toHaveBeenCalledWith({
      userId: "user_1",
      decisionId: "decision_1",
      actionTaken: "BAN_PERM",
      reasons: ["Severe abuse"],
    });
  });

  it("handles WARN report moderation with warning creation and notification", async () => {
    await moderateReportWarn("Warn", ["Abuse"], 7200, context, helpers);

    expect(env.prismaWarningCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          title: "Warn",
          reasons: ["Abuse"],
          warnedBy: "ADMIN_MODERATION",
        }),
      }),
    );
    expect(helpers.updateReportStatus).toHaveBeenCalledWith(
      "RESOLVED",
      "WARN",
      expect.objectContaining({
        title: "Warn",
      }),
    );
    expect(env.routeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user_1",
        event: "WARN",
      }),
    );
  });

  it("handles IGNORE report moderation by dismissing the report", async () => {
    await moderateReportIgnore("Ignore", ["No issue"], context, helpers);

    expect(helpers.applyContentModerationStatus).toHaveBeenCalled();
    expect(helpers.updateReportStatus).toHaveBeenCalledWith(
      "DISMISSED",
      "IGNORE",
      {
        title: "Ignore",
        reasons: ["No issue"],
      },
    );
    expect(env.moderationMetricsQueueAdd).toHaveBeenCalledWith(
      "IGNORE",
      { userId: "user_1", reviewedBy: "ADMIN_MODERATION" },
      expect.objectContaining({
        jobId: "moderationMetrics__decision_1__IGNORE",
      }),
    );
  });

  it("maps report actions to admin content moderation decisions after claim validation", async () => {
    await applyAdminReportModerationDecision({
      reportMongoId: "mongo_report_1",
      reportContentId: "question_1",
      reportContentVersion: 3,
      targetType: "QUESTION",
      actionTaken: "WARN",
      reviewedBy: "admin_1",
      decisionId: "decision_1",
      reportId: "report_1",
      claimToken: "claim_1",
    });

    expect(env.assertReportClaimIsCurrent).toHaveBeenCalledWith({
      reportMongoId: "mongo_report_1",
      reviewedBy: "admin_1",
      claimToken: "claim_1",
    });
    expect(env.applyAdminContentModerationDecision).toHaveBeenCalledWith(
      "question_1",
      "QUESTION",
      "FLAGGED",
      3,
    );
  });
});
