import { beforeEach, describe, expect, it, vi } from "vitest";

const moderationStatsFindUnique = vi.fn();
const moderationStatsUpdate = vi.fn();

vi.mock("../../../../../src/config/prisma.config.js", () => ({
  default: {
    moderationStats: {
      findUnique: moderationStatsFindUnique,
      update: moderationStatsUpdate,
    },
  },
}));

const { default: processModerationMetricsJob } = await import(
  "../../../../../src/services/moderation/worker/moderationMetrics.service.js"
);

describe("moderationMetrics worker service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates trust score for IGNORE actions", async () => {
    moderationStatsFindUnique.mockResolvedValueOnce({
      userId: "user_1",
      trustScore: 0.5,
    });

    await processModerationMetricsJob("IGNORE", {
      userId: "user_1",
      reviewedBy: "ADMIN_MODERATION",
    });

    expect(moderationStatsUpdate).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { trustScore: 0.51 },
    });
  });

  it("tracks AI permanent bans with a strike and trust score reduction", async () => {
    moderationStatsFindUnique.mockResolvedValueOnce({
      userId: "user_1",
      trustScore: 0.4,
    });

    await processModerationMetricsJob("BAN_PERM", {
      userId: "user_1",
      reviewedBy: "AI_MODERATION",
    });

    expect(moderationStatsUpdate).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        lastStrikeAt: expect.any(Date),
        totalStrikes: { increment: 1 },
        trustScore: expect.any(Number),
      },
    });
    expect(moderationStatsUpdate.mock.calls[0][0].data.trustScore).toBeCloseTo(
      0.15,
    );
  });

  it("rejects unsupported job names", async () => {
    await expect(
      processModerationMetricsJob("NOT_REAL", {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      }),
    ).rejects.toThrow("Unsupported moderation action job type: NOT_REAL");
  });

  it("rejects unsupported reviewers", async () => {
    await expect(
      processModerationMetricsJob("WARN", {
        userId: "user_1",
        reviewedBy: "SOMEONE_ELSE" as never,
      }),
    ).rejects.toThrow("Unsupported moderation reviewer: SOMEONE_ELSE");
  });
});
