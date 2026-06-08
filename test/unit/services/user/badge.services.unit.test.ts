import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserUnitModules,
  resetUserUnitTestEnvironment,
  mockUserUnitTestEnvironment as userUnitTestEnvironment,
} from "../../../helpers/user/mockUserUnitTestEnvironment.js";

vi.mock(
  "../../../../src/config/prisma.config.js",
  () => mockUserUnitModules.prismaConfig,
);
vi.mock(
  "../../../../src/utils/clearCache.util.js",
  () => mockUserUnitModules.clearCacheUtil,
);
vi.mock(
  "../../../../src/services/user/badge/rules/index.js",
  () => mockUserUnitModules.badgeRulesIndex,
);
vi.mock(
  "../../../../src/queues/badge.queue.js",
  () => mockUserUnitModules.badgeQueue,
);
vi.mock(
  "../../../../src/utils/makeJobId.util.js",
  () => mockUserUnitModules.makeJobId,
);

const { default: awardBadge } = await import(
  "../../../../src/services/user/badge/awardBadge.service.js"
);
const { default: queueBadgeAward } = await import(
  "../../../../src/services/user/badge/queueBadgeAward.service.js"
);
const { badgeTriggers } = await import(
  "../../../../src/services/user/badge/badge.shared.js"
);

describe("user badge services", () => {
  beforeEach(() => {
    resetUserUnitTestEnvironment();
  });

  it("queues account created badges by default", async () => {
    await queueBadgeAward({ userId: "user_1" });

    expect(userUnitTestEnvironment.badgeQueueAdd).toHaveBeenCalledWith(
      badgeTriggers.ACCOUNT_CREATED,
      { userId: "user_1" },
      expect.objectContaining({
        jobId: "badge__ACCOUNT_CREATED__user_1",
      }),
    );
  });

  it("rejects missing or deleted badge users", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue(null);

    await expect(
      awardBadge({ userId: "user_1", trigger: badgeTriggers.ACCOUNT_CREATED }),
    ).rejects.toThrow("Badge user not found: user_1");
  });

  it("rejects unsupported triggers when no rules match", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      registeredStage: "beta",
      isDeleted: false,
    });
    userUnitTestEnvironment.getBadgeRulesForTrigger.mockReturnValue([]);

    await expect(
      awardBadge({ userId: "user_1", trigger: badgeTriggers.ACCOUNT_CREATED }),
    ).rejects.toThrow("Unsupported badge trigger: ACCOUNT_CREATED");
  });

  it("skips rules whose shouldAward returns false", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      registeredStage: "beta",
      isDeleted: false,
    });
    userUnitTestEnvironment.getBadgeRulesForTrigger.mockReturnValue([
      {
        badgeName: "Founding Member",
        triggers: [badgeTriggers.ACCOUNT_CREATED],
        shouldAward: vi.fn(async () => false),
      },
    ]);

    await awardBadge({
      userId: "user_1",
      trigger: badgeTriggers.ACCOUNT_CREATED,
    });

    expect(userUnitTestEnvironment.prismaBadgeFindFirst).not.toHaveBeenCalled();
    expect(
      userUnitTestEnvironment.prismaUserBadgeUpsert,
    ).not.toHaveBeenCalled();
  });

  it("upserts awarded badges and clears cache", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      registeredStage: "beta",
      isDeleted: false,
    });
    userUnitTestEnvironment.getBadgeRulesForTrigger.mockReturnValue([
      {
        badgeName: "Founding Member",
        triggers: [badgeTriggers.ACCOUNT_CREATED],
        shouldAward: vi.fn(async () => true),
      },
      {
        badgeName: "Second Badge",
        triggers: [badgeTriggers.ACCOUNT_CREATED],
        shouldAward: vi.fn(async () => true),
      },
    ]);
    userUnitTestEnvironment.prismaBadgeFindFirst
      .mockResolvedValueOnce({ id: "badge_1", name: "Founding Member" })
      .mockResolvedValueOnce({ id: "badge_2", name: "Second Badge" });

    await awardBadge({
      userId: "user_1",
      trigger: badgeTriggers.ACCOUNT_CREATED,
    });

    expect(userUnitTestEnvironment.prismaUserBadgeUpsert).toHaveBeenCalledTimes(
      2,
    );
    expect(userUnitTestEnvironment.clearUserBadgesCache).toHaveBeenCalledTimes(
      2,
    );
  });

  it("rejects missing active badges", async () => {
    userUnitTestEnvironment.prismaUserFindUnique.mockResolvedValue({
      id: "user_1",
      registeredStage: "beta",
      isDeleted: false,
    });
    userUnitTestEnvironment.getBadgeRulesForTrigger.mockReturnValue([
      {
        badgeName: "Founding Member",
        triggers: [badgeTriggers.ACCOUNT_CREATED],
        shouldAward: vi.fn(async () => true),
      },
    ]);
    userUnitTestEnvironment.prismaBadgeFindFirst.mockResolvedValue(null);

    await expect(
      awardBadge({ userId: "user_1", trigger: badgeTriggers.ACCOUNT_CREATED }),
    ).rejects.toThrow("Badge not found: Founding Member");
  });
});
