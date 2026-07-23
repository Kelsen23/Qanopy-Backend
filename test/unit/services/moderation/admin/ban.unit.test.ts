import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

const mockRandomUUID = vi.fn<() => string>().mockReturnValue("decision_1");

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
  "../../../../../src/utils/cache/clearUserCache.util.js",
  () => mockModerationUnitModules.clearUserCache,
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
  "../../../../../src/services/moderation/admin/runSideEffectWithRetry.service.js",
  () => mockModerationUnitModules.runSideEffectWithRetryService,
);
vi.mock(
  "../../../../../src/services/moderation/sendUnbanNoticeEmail.service.js",
  () => mockModerationUnitModules.sendUnbanNoticeEmailService,
);

const { default: unbanUser } = await import(
  "../../../../../src/services/moderation/admin/ban/unbanUser.service.js"
);

describe("unbanUser", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    mockRandomUUID.mockReset().mockReturnValue("decision_1");
  });

  it("deactivates active bans, restores active status, clears cache, audits, and sends notice", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      status: "SUSPENDED",
    });
    moderationUnitTestEnvironment.prismaBanFindMany.mockResolvedValueOnce([
      { id: "ban_1" },
      { id: "ban_2" },
    ]);

    const result = await unbanUser({
      userId: "user_1",
      reviewedBy: "admin_1",
    });

    expect(
      moderationUnitTestEnvironment.prismaBanUpdateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: { in: ["ban_1", "ban_2"] },
      },
      data: { isActive: false },
    });
    expect(
      moderationUnitTestEnvironment.prismaUserStatusUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
        data: { status: "ACTIVE" },
    });
    expect(moderationUnitTestEnvironment.clearUserCache).toHaveBeenCalledWith(
      "user_1",
    );
    expect(
      moderationUnitTestEnvironment.moderationAuditQueueAdd,
    ).toHaveBeenCalledWith(
      "UNBAN_USER",
      expect.objectContaining({
        decisionId: "decision_1",
        targetId: "user_1",
        actionTaken: "UNBAN",
      }),
      expect.objectContaining({
        jobId: "moderationAudit__decision_1__unbanUser",
      }),
    );
    expect(
      moderationUnitTestEnvironment.sendUnbanNoticeEmail,
    ).toHaveBeenCalledWith({
      userId: "user_1",
      decisionId: "decision_1",
      deactivatedBanCount: 2,
    });
    expect(result).toEqual({
      message: "Successfully removed active bans",
      deactivatedBanCount: 2,
    });
  });

  it("rejects missing users and users with no active bans", async () => {
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce(
      null,
    );

    await expect(
      unbanUser({
        userId: "missing",
        reviewedBy: "admin_1",
      }),
    ).rejects.toMatchObject({
      message: "User not found",
      statusCode: 404,
    });

    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "user_1",
      status: "SUSPENDED",
    });
    moderationUnitTestEnvironment.prismaBanFindMany.mockResolvedValueOnce([]);

    await expect(
      unbanUser({
        userId: "user_1",
        reviewedBy: "admin_1",
      }),
    ).rejects.toMatchObject({
      message: "User has no active bans",
      statusCode: 404,
    });
  });
});
