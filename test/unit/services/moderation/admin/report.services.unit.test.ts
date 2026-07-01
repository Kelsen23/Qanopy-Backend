import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

const mockRandomUUID = vi
  .fn<() => string>()
  .mockReturnValueOnce("decision_1")
  .mockReturnValueOnce("claim_1");

vi.mock("crypto", () => ({
  default: {
    randomUUID: mockRandomUUID,
  },
}));
vi.mock(
  "../../../../../src/config/prisma.config.js",
  () => mockModerationUnitModules.prismaConfig,
);
vi.mock(
  "../../../../../src/models/report.model.js",
  () => mockModerationUnitModules.reportModel,
);
vi.mock(
  "../../../../../src/models/question.model.js",
  () => mockModerationUnitModules.questionModel,
);
vi.mock(
  "../../../../../src/models/questionVersion.model.js",
  () => mockModerationUnitModules.questionVersionModel,
);
vi.mock(
  "../../../../../src/models/answer.model.js",
  () => mockModerationUnitModules.answerModel,
);
vi.mock(
  "../../../../../src/models/reply.model.js",
  () => mockModerationUnitModules.replyModel,
);
vi.mock(
  "../../../../../src/models/aiAnswerFeedback.model.js",
  () => mockModerationUnitModules.aiAnswerFeedbackModel,
);
vi.mock(
  "../../../../../src/utils/cache/clearCache.util.js",
  () => mockModerationUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
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
  "../../../../../src/services/moderation/removeModeratedContent.service.js",
  () => mockModerationUnitModules.removeModeratedContentService,
);
vi.mock(
  "../../../../../src/services/moderation/applyAdminContentModerationDecision.service.js",
  () => mockModerationUnitModules.applyAdminContentModerationDecisionService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/runSideEffectWithRetry.service.js",
  () => mockModerationUnitModules.runSideEffectWithRetryService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/report/applyAdminReportModerationDecision.service.js",
  () => mockModerationUnitModules.applyAdminReportModerationDecisionService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/report/moderateReportBanTemp.service.js",
  () => mockModerationUnitModules.moderateReportBanTempService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/report/moderateReportBanPerm.service.js",
  () => mockModerationUnitModules.moderateReportBanPermService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/report/moderateReportWarn.service.js",
  () => mockModerationUnitModules.moderateReportWarnService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/report/moderateReportIgnore.service.js",
  () => mockModerationUnitModules.moderateReportIgnoreService,
);

const { default: assertReportClaimIsCurrent } = await import(
  "../../../../../src/services/moderation/admin/report/assertReportClaimIsCurrent.service.js"
);
const { default: finalizeReportReview } = await import(
  "../../../../../src/services/moderation/admin/report/finalizeReportReview.service.js"
);
const { default: resolveReportStatus } = await import(
  "../../../../../src/services/moderation/admin/report/resolveReportStatus.service.js"
);
const { default: queueReportContentRemoval } = await import(
  "../../../../../src/services/moderation/admin/report/queueReportContentRemoval.service.js"
);
const { default: adminModerateReport } = await import(
  "../../../../../src/services/moderation/admin/report/adminReportModeration.service.js"
);
const { default: assertAdminModerationTargetReady } = await import(
  "../../../../../src/services/moderation/admin/assertAdminModerationTargetReady.service.js"
);

describe("moderation admin report services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    mockRandomUUID
      .mockReset()
      .mockReturnValueOnce("decision_1")
      .mockReturnValueOnce("claim_1");
  });

  it("accepts active report claims and rejects expired ones", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );

    await expect(
      assertReportClaimIsCurrent({
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
    ).resolves.toBeUndefined();

    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain(null),
    );

    await expect(
      assertReportClaimIsCurrent({
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
    ).rejects.toMatchObject({
      message: "Report claim expired or changed",
      statusCode: 409,
    });
  });

  it("finalizes resolved reports by clearing claim fields", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );
    moderationUnitTestEnvironment.reportFindOneAndUpdate.mockResolvedValueOnce({
      _id: "report_1",
    });

    await finalizeReportReview({
      reportMongoId: "report_1",
      reviewedBy: "admin_1",
      claimToken: "claim_1",
    });

    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "report_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        status: { $in: ["RESOLVED", "DISMISSED"] },
      }),
      {
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
      { returnDocument: "after" },
    );
  });

  it("fails finalization when another path already resolved the report", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );
    moderationUnitTestEnvironment.reportFindOneAndUpdate.mockResolvedValueOnce(
      null,
    );

    await expect(
      finalizeReportReview({
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
    ).rejects.toMatchObject({
      message: "Report already resolved",
      statusCode: 409,
    });
  });

  it("updates report status and enqueues audit plus reporter notification", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );
    moderationUnitTestEnvironment.reportFindOneAndUpdate.mockResolvedValueOnce({
      id: "report_1",
      targetUserId: "target_1",
      isRemovingContent: true,
    });

    await resolveReportStatus(
      "RESOLVED",
      "BAN_TEMP",
      { reason: "spam" },
      {
        reportMongoId: "report_1",
        reviewedBy: "admin_1",
        decisionId: "decision_1",
        reportId: "report_public_1",
        reportTargetUserId: "target_1",
        reportContentId: "content_1",
        reportContentVersion: 3,
        targetType: "QUESTION",
        reporterUserId: "reporter_1",
        shouldRemoveContent: true,
        claimToken: "claim_1",
      },
    );

    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "report_1",
        status: "PENDING",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
      {
        status: "RESOLVED",
        actionTaken: "BAN_TEMP",
        isRemovingContent: true,
      },
      { returnDocument: "after" },
    );
    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).toHaveBeenCalledWith(
      "UPDATE_REPORT_STATUS",
      expect.objectContaining({
        decisionId: "decision_1",
        targetType: "REPORT",
        adminId: "admin_1",
        actionTaken: "BAN_TEMP",
        meta: { reason: "spam" },
      }),
      expect.objectContaining({
        jobId: "moderationAudit__decision_1__updateReportStatus",
      }),
    );
    expect(
      moderationUnitTestEnvironment.routeNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "reporter_1",
        event: "REPORT_UPDATE",
        meta: expect.objectContaining({
          reportId: "report_public_1",
          status: "RESOLVED",
          actionTaken: "BAN_TEMP",
          isRemovingContent: true,
          targetContentType: "QUESTION",
        }),
      }),
    );
  });

  it("removes reported content only when the removal side effect succeeds", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );
    moderationUnitTestEnvironment.removeModeratedContent.mockResolvedValueOnce({
      removed: true,
      message: "removed",
    });

    await queueReportContentRemoval(
      { source: "admin-review" },
      {
        reportMongoId: "report_1",
        reportId: "report_public_1",
        reportTargetUserId: "target_1",
        reportContentId: "content_1",
        reportContentVersion: 3,
        targetType: "QUESTION",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        decisionId: "decision_1",
        actionTaken: "BAN_TEMP",
      },
    );

    expect(
      moderationUnitTestEnvironment.removeModeratedContent,
    ).toHaveBeenCalledWith("QUESTION", "content_1", 3);
    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).toHaveBeenCalledWith(
      "REMOVE_CONTENT",
      expect.objectContaining({
        targetType: "CONTENT",
        targetId: "content_1",
        actionTaken: "REMOVE",
      }),
      expect.objectContaining({
        jobId: "moderationAudit__decision_1__removeContent",
      }),
    );
    expect(
      moderationUnitTestEnvironment.routeNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "target_1",
        event: "REMOVE_CONTENT",
      }),
    );
  });

  it("skips audit and notification when content removal does not remove anything", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "report_1" }),
    );
    moderationUnitTestEnvironment.removeModeratedContent.mockResolvedValueOnce({
      removed: false,
      message: "noop",
    });

    await queueReportContentRemoval(
      {},
      {
        reportMongoId: "report_1",
        reportId: "report_public_1",
        reportTargetUserId: "target_1",
        reportContentId: "content_1",
        reportContentVersion: 3,
        targetType: "QUESTION",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        decisionId: "decision_1",
        actionTaken: "BAN_TEMP",
      },
    );

    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).not.toHaveBeenCalled();
    expect(
      moderationUnitTestEnvironment.routeNotification,
    ).not.toHaveBeenCalled();
  });

  it("claims a report, routes BAN_TEMP moderation, finalizes, and clears cache", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockResolvedValueOnce({
      _id: "mongo_report_1",
      id: "report_public_1",
      status: "PENDING",
      targetUserId: "target_1",
      targetId: "content_1",
      targetContentVersion: 3,
      targetType: "QUESTION",
      reportedBy: "reporter_1",
    });
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "target_1",
    });
    moderationUnitTestEnvironment.questionFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        currentVersion: 3,
        isActive: true,
      }),
    );
    moderationUnitTestEnvironment.questionVersionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "version_3" }),
    );
    moderationUnitTestEnvironment.reportFindOne
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          _id: "mongo_report_1",
        }),
      )
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          _id: "mongo_report_1",
        }),
      );
    moderationUnitTestEnvironment.reportFindOneAndUpdate.mockResolvedValueOnce({
      _id: "mongo_report_1",
      id: "report_public_1",
    });
    moderationUnitTestEnvironment.reportFindOneAndUpdate.mockResolvedValueOnce({
      _id: "mongo_report_1",
    });

    await adminModerateReport({
      targetId: "mongo_report_1",
      reviewedBy: "admin_1",
      reviewComment: "reviewed",
      actionTaken: "BAN_TEMP",
      title: "Spam",
      reasons: ["Spam"],
      banDurationMs: 3600,
    });

    expect(moderationUnitTestEnvironment.questionFindById).toHaveBeenCalledWith(
      "content_1",
    );
    expect(
      moderationUnitTestEnvironment.questionVersionFindOne,
    ).toHaveBeenCalledWith({
      questionId: "content_1",
      version: 3,
    });
    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "mongo_report_1",
        status: "PENDING",
      }),
      expect.objectContaining({
        reviewedBy: "admin_1",
        reviewComment: "reviewed",
        claimToken: "claim_1",
      }),
      { returnDocument: "after" },
    );
    expect(
      moderationUnitTestEnvironment.moderateReportBanTemp,
    ).toHaveBeenCalledWith(
      "Spam",
      ["Spam"],
      3600,
      expect.objectContaining({
        reportId: "report_public_1",
        reportMongoId: "mongo_report_1",
        reportContentId: "content_1",
        reportContentVersion: 3,
        claimToken: "claim_1",
        decisionId: "decision_1",
      }),
      expect.objectContaining({
        updateReportStatus: expect.any(Function),
        applyContentModerationStatus: expect.any(Function),
        queueDeleteContentIfNeeded: expect.any(Function),
      }),
    );
    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _id: "mongo_report_1",
        status: { $in: ["RESOLVED", "DISMISSED"] },
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
      {
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
      { returnDocument: "after" },
    );
    expect(
      moderationUnitTestEnvironment.runSideEffectWithRetry,
    ).toHaveBeenNthCalledWith(
      2,
      "clearReportsCache",
      expect.any(Function),
      expect.objectContaining({
        reportMongoId: "mongo_report_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        phase: "success",
      }),
    );
  });

  it("rejects self-moderation before claim acquisition", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockResolvedValueOnce({
      _id: "mongo_report_1",
      id: "report_public_1",
      status: "PENDING",
      targetUserId: "admin_1",
      targetId: "content_1",
      targetContentVersion: 3,
      targetType: "QUESTION",
      reportedBy: "reporter_1",
    });
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "admin_1",
    });

    await expect(
      adminModerateReport({
        targetId: "mongo_report_1",
        reviewedBy: "admin_1",
        actionTaken: "IGNORE",
        title: "Ignore",
        reasons: ["Not actionable"],
      }),
    ).rejects.toMatchObject({
      message: "Self-moderation not allowed",
      statusCode: 403,
    });

    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).not.toHaveBeenCalled();
  });

  it("rolls back the claim when downstream report moderation fails", async () => {
    moderationUnitTestEnvironment.reportFindOne.mockResolvedValueOnce({
      _id: "mongo_report_1",
      id: "report_public_1",
      status: "PENDING",
      targetUserId: "target_1",
      targetId: "content_1",
      targetContentVersion: 3,
      targetType: "QUESTION",
      reportedBy: "reporter_1",
    });
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "target_1",
    });
    moderationUnitTestEnvironment.questionFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        currentVersion: 3,
        isActive: true,
      }),
    );
    moderationUnitTestEnvironment.questionVersionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "version_3" }),
    );
    moderationUnitTestEnvironment.reportFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "mongo_report_1" }),
    );
    moderationUnitTestEnvironment.reportFindOneAndUpdate
      .mockResolvedValueOnce({
        _id: "mongo_report_1",
        id: "report_public_1",
      })
      .mockResolvedValueOnce({
        _id: "mongo_report_1",
      });
    moderationUnitTestEnvironment.moderateReportWarn.mockRejectedValueOnce(
      new Error("queue failed"),
    );

    await expect(
      adminModerateReport({
        targetId: "mongo_report_1",
        reviewedBy: "admin_1",
        actionTaken: "WARN",
        title: "Warn",
        reasons: ["Abuse"],
        warningDurationMs: 7200,
      }),
    ).rejects.toThrow("queue failed");

    expect(
      moderationUnitTestEnvironment.reportFindOneAndUpdate,
    ).toHaveBeenLastCalledWith(
      {
        _id: "mongo_report_1",
        status: "PENDING",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      },
      {
        reviewedBy: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
        reviewedAt: null,
        $unset: { reviewComment: 1 },
      },
      { returnDocument: "after" },
    );
    expect(
      moderationUnitTestEnvironment.runSideEffectWithRetry,
    ).toHaveBeenNthCalledWith(
      2,
      "clearReportsCache",
      expect.any(Function),
      expect.objectContaining({
        phase: "rollback",
      }),
    );
  });

  it("verifies moderation targets by content type and question version", async () => {
    moderationUnitTestEnvironment.questionFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        currentVersion: 5,
        isActive: true,
      }),
    );
    moderationUnitTestEnvironment.questionVersionFindOne.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({ _id: "version_1" }),
    );

    await expect(
      assertAdminModerationTargetReady({
        targetType: "QUESTION",
        targetId: "question_1",
        targetContentVersion: 4,
      }),
    ).resolves.toBeUndefined();

    moderationUnitTestEnvironment.answerFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain(null),
    );

    await expect(
      assertAdminModerationTargetReady({
        targetType: "ANSWER",
        targetId: "answer_1",
      }),
    ).rejects.toMatchObject({
      message: "Answer not found",
      statusCode: 404,
    });
  });
});
