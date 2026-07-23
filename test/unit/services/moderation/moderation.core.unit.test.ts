import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockModerationUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockModerationUnitModules.redisConfig,
);
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
vi.mock(
  "../../../../src/models/aiAnswerFeedback.model.js",
  () => mockModerationUnitModules.aiAnswerFeedbackModel,
);
vi.mock(
  "../../../../src/models/report.model.js",
  () => mockModerationUnitModules.reportModel,
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
  "../../../../src/utils/job/makeJobId.util.js",
  () => mockModerationUnitModules.makeJobId,
);
vi.mock(
  "../../../../src/utils/email/renderTemplate.util.js",
  () => mockModerationUnitModules.renderTemplateUtil,
);
vi.mock(
  "../../../../src/utils/moderation/formatBanNotice.util.js",
  () => mockModerationUnitModules.formatBanNoticeUtil,
);
vi.mock(
  "../../../../src/services/moderation/admin/report/adminReportModeration.service.js",
  () => ({
    default: moderationUnitTestEnvironment.moderateReportBanPerm,
  }),
);
vi.mock(
  "../../../../src/services/moderation/admin/strike/adminStrikeModeration.service.js",
  () => ({
    default: moderationUnitTestEnvironment.moderateStrikeBanPerm,
  }),
);
vi.mock(
  "../../../../src/services/moderation/modPoints.service.js",
  () => mockModerationUnitModules.modPointsService,
);
vi.mock(
  "../../../../src/services/moderation/resolveUserBanState.service.js",
  () => ({
    default: moderationUnitTestEnvironment.resolveReportStatus,
  }),
);
vi.mock(
  "../../../../src/services/moderation/getActiveBanState.service.js",
  () => mockModerationUnitModules.getActiveBanStateService,
);
vi.mock(
  "../../../../src/queues/email.queue.js",
  () => mockModerationUnitModules.emailQueue,
);

const { default: moderate } = await import(
  "../../../../src/services/moderation/moderate.service.js"
);
const { default: createReport } = await import(
  "../../../../src/services/moderation/createReport.service.js"
);
const { default: applyUserBan } = await import(
  "../../../../src/services/moderation/applyUserBan.service.js"
);
const { default: getBan } = await import(
  "../../../../src/services/moderation/getBan.service.js"
);
const { default: sendBanNoticeEmail } = await import(
  "../../../../src/services/moderation/sendBanNoticeEmail.service.js"
);
const { default: sendUnbanNoticeEmail } = await import(
  "../../../../src/services/moderation/sendUnbanNoticeEmail.service.js"
);

describe("moderation core services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
  });

  it("checks mod points, dispatches to report moderation, and then adds points", async () => {
    const result = await moderate({
      userId: "admin_1",
      type: "REPORT",
      targetId: "report_1",
      actionTaken: "BAN_PERM",
      title: "Severe abuse",
      reasons: ["Severe abuse"],
    });

    expect(
      moderationUnitTestEnvironment.checkAdminModPointsLimit,
    ).toHaveBeenCalledWith("admin_1");
    expect(
      moderationUnitTestEnvironment.moderateReportBanPerm,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "report_1",
        reviewedBy: "admin_1",
        actionTaken: "BAN_PERM",
      }),
    );
    expect(
      moderationUnitTestEnvironment.addAdminModPoints,
    ).toHaveBeenCalledWith("admin_1", "BAN_PERM");
    expect(result).toEqual({
      message: "Successfully moderated report",
    });
  });

  it("dispatches strike moderation for STRIKE reviews", async () => {
    await moderate({
      userId: "admin_1",
      type: "STRIKE",
      targetId: "strike_1",
      actionTaken: "WARN",
      title: "Warn",
      reasons: ["Abuse"],
      warningDurationMs: 3600,
    });

    expect(
      moderationUnitTestEnvironment.moderateStrikeBanPerm,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "strike_1",
        reviewedBy: "admin_1",
        actionTaken: "WARN",
        warningDurationMs: 3600,
      }),
    );
  });

  it("creates reports for active question content and clears report cache", async () => {
    moderationUnitTestEnvironment.questionFindOne.mockResolvedValueOnce({
      userId: "target_1",
      currentVersion: 5,
    });
    moderationUnitTestEnvironment.reportCreate.mockResolvedValueOnce({
      toJSON: () => ({
        id: "report_1",
        reportedBy: "user_1",
        targetId: "question_1",
        targetContentVersion: 4,
        targetUserId: "target_1",
        targetType: "QUESTION",
        reportReason: "SPAM",
        reportComment: "Spam",
        status: "PENDING",
        actionTaken: null,
        reviewedAt: null,
      }),
    });

    const result = await createReport({
      reportedBy: "user_1",
      targetId: "question_1",
      targetType: "QUESTION",
      targetContentVersion: 4,
      reportReason: "SPAM",
      reportComment: "Spam",
    });

    expect(moderationUnitTestEnvironment.reportCreate).toHaveBeenCalledWith({
      reportedBy: "user_1",
      targetId: "question_1",
      targetContentVersion: 4,
      targetUserId: "target_1",
      targetType: "QUESTION",
      reportReason: "SPAM",
      reportComment: "Spam",
    });
    expect(moderationUnitTestEnvironment.clearReportsCache).toHaveBeenCalled();
    expect(result).toEqual({
      report: {
        id: "report_1",
        reportedBy: "user_1",
        targetId: "question_1",
        targetContentVersion: 4,
        targetUserId: "target_1",
        targetType: "QUESTION",
        reportReason: "SPAM",
        reportComment: "Spam",
      },
    });
  });

  it("rejects report creation when the target question version does not exist", async () => {
    moderationUnitTestEnvironment.questionFindOne.mockResolvedValueOnce({
      userId: "target_1",
      currentVersion: 2,
    });

    await expect(
      createReport({
        reportedBy: "user_1",
        targetId: "question_1",
        targetType: "QUESTION",
        targetContentVersion: 3,
        reportReason: "SPAM",
      }),
    ).rejects.toMatchObject({
      message: "Target question version not found",
      statusCode: 404,
    });
  });

  it("creates a temporary ban when no permanent ban exists and updates user status", async () => {
    moderationUnitTestEnvironment.getActiveBanState
      .mockResolvedValueOnce({
        hasActivePermBan: false,
      })
      .mockResolvedValueOnce({
        derivedStatus: "SUSPENDED",
      });

    const result = await applyUserBan(
      {
        ban: {
          create: moderationUnitTestEnvironment.prismaBanCreate,
          updateMany: moderationUnitTestEnvironment.prismaBanUpdateMany,
          findMany: moderationUnitTestEnvironment.prismaBanFindMany,
        },
        user: {
          update: moderationUnitTestEnvironment.prismaUserUpdate,
        },
        userStatus: {
          update: moderationUnitTestEnvironment.prismaUserStatusUpdate,
        },
      } as any,
      {
        userId: "user_1",
        banType: "TEMP",
        title: "Spam",
        reasons: ["Spam"],
        bannedBy: "ADMIN_MODERATION",
        durationMs: 3600,
        now: new Date("2030-01-01T00:00:00.000Z"),
      },
    );

    expect(moderationUnitTestEnvironment.prismaBanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          banType: "TEMP",
          title: "Spam",
          bannedBy: "ADMIN_MODERATION",
          durationMs: 3600,
        }),
      }),
    );
    expect(
      moderationUnitTestEnvironment.prismaUserStatusUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
        data: { status: "SUSPENDED" },
    });
    expect(result).toEqual({
      createdBan: true,
      status: "SUSPENDED",
    });
  });

  it("returns the active ban and clears user cache when ban resolution changed state", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
    });
    moderationUnitTestEnvironment.resolveReportStatus.mockResolvedValueOnce({
      activeBan: { id: "ban_1", banType: "TEMP" },
      changed: true,
    });

    const result = await getBan({ userId: "user_1" });

    expect(moderationUnitTestEnvironment.clearUserCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(result).toEqual({
      ban: { id: "ban_1", banType: "TEMP" },
      message: "Successfully received ban",
    });
  });

  it("returns no active ban when the user does not exist", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce(
      null,
    );

    await expect(getBan({ userId: "missing" })).resolves.toEqual({
      ban: null,
      message: "Active ban not found",
    });
  });

  it("sends ban notice emails when the user exists and has an email", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isDeleted: false,
    });

    const result = await sendBanNoticeEmail({
      userId: "user_1",
      decisionId: "decision_1",
      actionTaken: "BAN_TEMP",
      reasons: ["Spam"],
      banDurationMs: 3600,
    });

    expect(moderationUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_BAN_NOTICE_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
        purpose: "BAN_TEMP",
      }),
      expect.objectContaining({
        jobId:
          "unique__email__SEND_BAN_NOTICE_EMAIL__decision_1__user_1__BAN_TEMP",
      }),
    );
    expect(result).toEqual({ sent: true });
  });

  it("swallows ban notice enqueue failures and returns sent false", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isDeleted: false,
    });
    moderationUnitTestEnvironment.emailQueueAdd.mockRejectedValueOnce(
      new Error("queue unavailable"),
    );

    await expect(
      sendBanNoticeEmail({
        userId: "user_1",
        decisionId: "decision_1",
        actionTaken: "BAN_PERM",
      }),
    ).resolves.toEqual({ sent: false });
  });

  it("sends unban notice emails when the user exists and has an email", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "alice@example.com",
      username: "alice",
      isDeleted: false,
    });

    const result = await sendUnbanNoticeEmail({
      userId: "user_1",
      decisionId: "decision_1",
      deactivatedBanCount: 2,
    });

    expect(moderationUnitTestEnvironment.emailQueueAdd).toHaveBeenCalledWith(
      "SEND_UNBAN_NOTICE_EMAIL",
      expect.objectContaining({
        email: "alice@example.com",
        purpose: "UNBAN",
      }),
      expect.objectContaining({
        jobId: "unique__email__SEND_UNBAN_NOTICE_EMAIL__decision_1__user_1",
      }),
    );
    expect(result).toEqual({ sent: true });
  });
});
