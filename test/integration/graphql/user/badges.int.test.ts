import { beforeEach, describe, expect, it, vi } from "vitest";

import executeUserGraphql from "../../../helpers/user/executeUserGraphql.js";
import type { UserGraphqlContext } from "../../../helpers/user/executeUserGraphql.js";

const query = `
  query Badges($cursor: UserBadgeCursorInput, $limitCount: Int) {
    badges(cursor: $cursor, limitCount: $limitCount) {
      badges {
        badgeId
        name
        description
        iconKey
        colorKey
        imageKey
        isActive
        awardedAt
        source
        createdAt
        updatedAt
      }
      nextCursor {
        awardedAt
        badgeId
      }
      hasMore
    }
  }
`;

type BadgesQueryResult = {
  badges: {
    badges: Array<{
      badgeId: string;
      name: string;
      description: string | null;
      iconKey: string | null;
      colorKey: string | null;
      imageKey: string | null;
      isActive: boolean;
      awardedAt: string;
      source: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    nextCursor: {
      awardedAt: string;
      badgeId: string;
    } | null;
    hasMore: boolean;
  } | null;
};

describe("GraphQL badges query", () => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const prismaUserBadgeFindMany = vi.fn();
  const prismaBadgeFindMany = vi.fn();

  const contextValue: UserGraphqlContext = {
    user: {
      id: "user_1",
    },
    prisma: {
      userBadge: {
        findMany: prismaUserBadgeFindMany,
      },
      badge: {
        findMany: prismaBadgeFindMany,
      },
    },
    getRedisCacheClient: () => ({
      get: redisGet,
      set: redisSet,
    }),
    loaders: {
      userLoader: {
        loadMany: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    redisGet.mockReset();
    redisSet.mockReset();
    prismaUserBadgeFindMany.mockReset();
    prismaBadgeFindMany.mockReset();
  });

  it("uses cached badge pages without prisma lookups", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        badges: [
          {
            badgeId: "badge_1",
            name: "First Badge",
            description: "Awarded for testing",
            iconKey: "icon_1",
            colorKey: "gold",
            imageKey: "badge_1.png",
            isActive: true,
            awardedAt: "2026-01-01T00:00:00.000Z",
            source: "SYSTEM",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );

    const result = await executeUserGraphql<BadgesQueryResult>({
      query,
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.badges).toEqual({
      badges: [
        {
          badgeId: "badge_1",
          name: "First Badge",
          description: "Awarded for testing",
          iconKey: "icon_1",
          colorKey: "gold",
          imageKey: "badge_1.png",
          isActive: true,
          awardedAt: "2026-01-01T00:00:00.000Z",
          source: "SYSTEM",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    expect(redisGet).toHaveBeenCalledWith("user:badges:user_1:initial:5");
    expect(prismaUserBadgeFindMany).not.toHaveBeenCalled();
    expect(prismaBadgeFindMany).not.toHaveBeenCalled();
  });

  it("loads, merges, paginates, and caches badges on a cache miss", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaUserBadgeFindMany.mockResolvedValue([
      {
        badgeId: "badge_2",
        awardedAt: new Date("2026-01-03T00:00:00.000Z"),
        source: "QUESTIONS",
      },
      {
        badgeId: "badge_1",
        awardedAt: new Date("2026-01-02T00:00:00.000Z"),
        source: "ANSWERS",
      },
    ]);
    prismaBadgeFindMany.mockResolvedValue([
      {
        id: "badge_2",
        name: "Second Badge",
        description: "Second",
        iconKey: "icon_2",
        colorKey: "silver",
        imageKey: "badge_2.png",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await executeUserGraphql<BadgesQueryResult>({
      query,
      variables: {
        limitCount: 1,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.badges).toEqual({
      badges: [
        {
          badgeId: "badge_2",
          name: "Second Badge",
          description: "Second",
          iconKey: "icon_2",
          colorKey: "silver",
          imageKey: "badge_2.png",
          isActive: true,
          awardedAt: "2026-01-03T00:00:00.000Z",
          source: "QUESTIONS",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: {
        awardedAt: "2026-01-03T00:00:00.000Z",
        badgeId: "badge_2",
      },
      hasMore: true,
    });
    expect(prismaUserBadgeFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
      orderBy: [{ awardedAt: "desc" }, { badgeId: "desc" }],
      take: 2,
      select: {
        badgeId: true,
        awardedAt: true,
        source: true,
      },
    });
    expect(redisSet).toHaveBeenCalledWith(
      "user:badges:user_1:initial:1",
      JSON.stringify({
        badges: [
          {
            badgeId: "badge_2",
            name: "Second Badge",
            description: "Second",
            iconKey: "icon_2",
            colorKey: "silver",
            imageKey: "badge_2.png",
            isActive: true,
            awardedAt: "2026-01-03T00:00:00.000Z",
            source: "QUESTIONS",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: {
          awardedAt: "2026-01-03T00:00:00.000Z",
          badgeId: "badge_2",
        },
        hasMore: true,
      }),
      "EX",
      60 * 15,
    );
  });

  it("applies the default limit when limitCount is invalid", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaUserBadgeFindMany.mockResolvedValue([]);
    prismaBadgeFindMany.mockResolvedValue([]);

    const result = await executeUserGraphql<BadgesQueryResult>({
      query,
      variables: {
        limitCount: -3,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(prismaUserBadgeFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
      orderBy: [{ awardedAt: "desc" }, { badgeId: "desc" }],
      take: 6,
      select: {
        badgeId: true,
        awardedAt: true,
        source: true,
      },
    });
    expect(redisGet).toHaveBeenCalledWith("user:badges:user_1:initial:5");
  });

  it("rejects invalid cursors", async () => {
    const result = await executeUserGraphql<BadgesQueryResult>({
      query,
      variables: {
        cursor: {
          awardedAt: "not-a-date",
          badgeId: "",
        },
      },
      contextValue,
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Invalid cursor");
  });
});
