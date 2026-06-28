import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationUnitModules,
  mockModerationUnitTestEnvironment as moderationUnitTestEnvironment,
  resetModerationUnitTestEnvironment,
} from "../../../../helpers/moderation/mockModerationUnitTestEnvironment.js";

const mockRandomUUID = vi
  .fn<() => string>()
  .mockReturnValueOnce("claim_1")
  .mockReturnValueOnce("decision_1");

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
  "../../../../../src/models/question.model.js",
  () => mockModerationUnitModules.questionModel,
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
  "../../../../../src/services/moderation/admin/runSideEffectWithRetry.service.js",
  () => mockModerationUnitModules.runSideEffectWithRetryService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeBanTemp.service.js",
  () => mockModerationUnitModules.moderateStrikeBanTempService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeBanPerm.service.js",
  () => mockModerationUnitModules.moderateStrikeBanPermService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeWarn.service.js",
  () => mockModerationUnitModules.moderateStrikeWarnService,
);
vi.mock(
  "../../../../../src/services/moderation/admin/strike/moderateStrikeIgnore.service.js",
  () => mockModerationUnitModules.moderateStrikeIgnoreService,
);

const { default: assertStrikeClaimIsCurrent } = await import(
  "../../../../../src/services/moderation/admin/strike/assertStrikeClaimIsCurrent.service.js"
);
const { default: finalizeStrikeReview } = await import(
  "../../../../../src/services/moderation/admin/strike/finalizeStrikeReview.service.js"
);
const { default: getTargetContentState } = await import(
  "../../../../../src/services/moderation/admin/strike/getTargetContentState.service.js"
);
const { default: adminModerateStrike } = await import(
  "../../../../../src/services/moderation/admin/strike/adminStrikeModeration.service.js"
);

describe("moderation admin strike services", () => {
  beforeEach(() => {
    resetModerationUnitTestEnvironment();
    mockRandomUUID
      .mockReset()
      .mockReturnValueOnce("claim_1")
      .mockReturnValueOnce("decision_1");
  });

  it("accepts active strike claims and rejects expired ones", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      {
        id: "strike_1",
      },
    );

    await expect(
      assertStrikeClaimIsCurrent({
        strikeMongoId: "strike_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
    ).resolves.toBeUndefined();

    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      null,
    );

    await expect(
      assertStrikeClaimIsCurrent({
        strikeMongoId: "strike_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
    ).rejects.toMatchObject({
      message: "Strike claim expired or changed",
      statusCode: 409,
    });
  });

  it("finalizes strike reviews by writing the final action and clearing claim fields", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      {
        id: "strike_1",
      },
    );
    moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany.mockResolvedValueOnce(
      {
        count: 1,
      },
    );

    await finalizeStrikeReview({
      strikeMongoId: "strike_1",
      reviewedBy: "admin_1",
      claimToken: "claim_1",
      actionTaken: "BAN_TEMP",
      isRemovingContent: true,
    });

    expect(
      moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany,
    ).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "strike_1",
        actionTaken: "PENDING",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
      data: {
        actionTaken: "BAN_TEMP",
        isRemovingContent: true,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
    });
  });

  it("fails strike finalization when another reviewer already completed it", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      {
        id: "strike_1",
      },
    );
    moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany.mockResolvedValueOnce(
      {
        count: 0,
      },
    );

    await expect(
      finalizeStrikeReview({
        strikeMongoId: "strike_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        actionTaken: "WARN",
        isRemovingContent: false,
      }),
    ).rejects.toMatchObject({
      message: "Strike already reviewed",
      statusCode: 409,
    });
  });

  it("returns target content state with owner and removability flags", async () => {
    moderationUnitTestEnvironment.answerFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        userId: "target_1",
        isActive: true,
        isDeleted: false,
      }),
    );

    await expect(
      getTargetContentState("ANSWER", "answer_1", "target_1"),
    ).resolves.toEqual({
      exists: true,
      isActive: true,
      isDeleted: false,
      ownerMatches: true,
      canRemove: true,
    });

    moderationUnitTestEnvironment.replyFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain(null),
    );

    await expect(
      getTargetContentState("REPLY", "reply_1", "target_1"),
    ).resolves.toEqual({
      exists: false,
      isActive: false,
      isDeleted: false,
      ownerMatches: false,
      canRemove: false,
    });
  });

  it("claims a strike, routes BAN_PERM moderation, finalizes, and clears strike cache", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindUnique
      .mockResolvedValueOnce({
        id: "strike_1",
        userId: "target_1",
        targetType: "ANSWER",
        targetContentId: "answer_1",
        targetContentVersion: 4,
        aiDecision: "BAN_TEMP",
        aiConfidence: 0.95,
        aiReasons: ["Spam"],
        severity: 4,
        riskScore: 6.2,
      })
      .mockResolvedValueOnce({
        id: "strike_1",
        userId: "target_1",
        actionTaken: "PENDING",
        targetType: "ANSWER",
        targetContentId: "answer_1",
        targetContentVersion: 4,
        aiDecision: "BAN_TEMP",
        aiConfidence: 0.95,
        aiReasons: ["Spam"],
        severity: 4,
        riskScore: 6.2,
      });
    moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany.mockResolvedValueOnce(
      {
        count: 1,
      },
    );
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "target_1",
    });
    moderationUnitTestEnvironment.answerFindById
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      )
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      )
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      );
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      {
        id: "strike_1",
      },
    );
    moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany.mockResolvedValueOnce(
      {
        count: 1,
      },
    );

    await adminModerateStrike({
      targetId: "strike_1",
      reviewedBy: "admin_1",
      reviewComment: "confirmed",
      actionTaken: "BAN_PERM",
      title: "Permanent ban",
      reasons: ["Severe abuse"],
    });

    expect(moderationUnitTestEnvironment.answerFindById).toHaveBeenCalledWith(
      "answer_1",
    );
    expect(
      moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany,
    ).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "strike_1",
        actionTaken: "PENDING",
        OR: [
          { reviewedBy: null },
          { claimExpiresAt: { lte: expect.any(Date) } },
        ],
      }),
      data: expect.objectContaining({
        reviewedBy: "admin_1",
        reviewComment: "confirmed",
        claimToken: "claim_1",
      }),
    });
    expect(
      moderationUnitTestEnvironment.moderateStrikeBanPerm,
    ).toHaveBeenCalledWith(
      "Permanent ban",
      ["Severe abuse"],
      expect.objectContaining({
        strikeId: "strike_1",
        targetUserId: "target_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
        decisionId: "decision_1",
      }),
      expect.objectContaining({
        canRemove: true,
      }),
    );
    expect(
      moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany,
    ).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: "strike_1",
        actionTaken: "PENDING",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      }),
      data: {
        actionTaken: "BAN_PERM",
        isRemovingContent: true,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
    });
    expect(
      moderationUnitTestEnvironment.runSideEffectWithRetry,
    ).toHaveBeenCalledWith(
      "clearStrikesCache",
      expect.any(Function),
      expect.objectContaining({
        decisionId: "decision_1",
        strikeId: "strike_1",
        actionTaken: "BAN_PERM",
        targetUserId: "target_1",
      }),
    );
  });

  it("rejects strike moderation when content ownership mismatches the striked user", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindUnique.mockResolvedValueOnce(
      {
        id: "strike_1",
        userId: "target_1",
        targetType: "ANSWER",
        targetContentId: "answer_1",
        targetContentVersion: 4,
        aiDecision: "BAN_TEMP",
        aiConfidence: 0.95,
        aiReasons: ["Spam"],
        severity: 4,
        riskScore: 6.2,
      },
    );
    moderationUnitTestEnvironment.answerFindById.mockReturnValueOnce(
      moderationUnitTestEnvironment.createQueryChain({
        userId: "someone_else",
        isActive: true,
        isDeleted: false,
      }),
    );

    await expect(
      adminModerateStrike({
        targetId: "strike_1",
        reviewedBy: "admin_1",
        actionTaken: "IGNORE",
        title: "Ignore",
        reasons: ["Not actionable"],
      }),
    ).rejects.toMatchObject({
      message: "Strike target content owner mismatch",
      statusCode: 409,
    });
  });

  it("rolls back the strike claim when downstream moderation fails", async () => {
    moderationUnitTestEnvironment.prismaModerationStrikeFindUnique
      .mockResolvedValueOnce({
        id: "strike_1",
        userId: "target_1",
        targetType: "ANSWER",
        targetContentId: "answer_1",
        targetContentVersion: 4,
        aiDecision: "BAN_TEMP",
        aiConfidence: 0.95,
        aiReasons: ["Spam"],
        severity: 4,
        riskScore: 6.2,
      })
      .mockResolvedValueOnce({
        id: "strike_1",
        userId: "target_1",
        actionTaken: "PENDING",
        targetType: "ANSWER",
        targetContentId: "answer_1",
        targetContentVersion: 4,
        aiDecision: "BAN_TEMP",
        aiConfidence: 0.95,
        aiReasons: ["Spam"],
        severity: 4,
        riskScore: 6.2,
      });
    moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    moderationUnitTestEnvironment.prismaUserFindUnique.mockResolvedValueOnce({
      id: "target_1",
    });
    moderationUnitTestEnvironment.answerFindById
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      )
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      )
      .mockReturnValueOnce(
        moderationUnitTestEnvironment.createQueryChain({
          userId: "target_1",
          isActive: true,
          isDeleted: false,
        }),
      );
    moderationUnitTestEnvironment.prismaModerationStrikeFindFirst.mockResolvedValueOnce(
      {
        id: "strike_1",
      },
    );
    moderationUnitTestEnvironment.moderateStrikeWarn.mockRejectedValueOnce(
      new Error("notify failed"),
    );

    await expect(
      adminModerateStrike({
        targetId: "strike_1",
        reviewedBy: "admin_1",
        actionTaken: "WARN",
        title: "Warn",
        reasons: ["Abuse"],
        warningDurationMs: 7200,
      }),
    ).rejects.toThrow("notify failed");

    expect(
      moderationUnitTestEnvironment.prismaModerationStrikeUpdateMany,
    ).toHaveBeenLastCalledWith({
      where: {
        id: "strike_1",
        reviewedBy: "admin_1",
        claimToken: "claim_1",
      },
      data: {
        reviewedBy: null,
        reviewedAt: null,
        reviewComment: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
    });
  });
});
