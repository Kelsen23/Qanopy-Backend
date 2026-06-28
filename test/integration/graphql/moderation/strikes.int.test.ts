import { beforeEach, describe, expect, it, vi } from "vitest";

import executeModerationGraphql from "../../../helpers/moderation/executeModerationGraphql.js";
import type { ModerationGraphqlContext } from "../../../helpers/moderation/executeModerationGraphql.js";

const query = `
  query Strikes($filter: StrikeFilter, $cursor: StrikeCursorInput, $limitCount: Int) {
    strikes(filter: $filter, cursor: $cursor, limitCount: $limitCount) {
      strikes {
        id
        userId
        aiDecision
        aiConfidence
        aiReasons
        severity
        riskScore
        targetContentId
        targetType
        targetContentVersion
        strikedBy
        adminId
        strikeComment
        reviewedBy
        reviewComment
        actionTaken
        isRemovingContent
        reviewedAt
        targetUser {
          id
          username
        }
        admin {
          id
          username
        }
        createdAt
        updatedAt
      }
      nextCursor {
        id
        createdAt
      }
      hasMore
    }
  }
`;

type StrikesQueryResult = {
  strikes: {
    strikes: Array<{
      id: string;
      userId: string;
      aiDecision: string | null;
      aiConfidence: number | null;
      aiReasons: string[];
      severity: number | null;
      riskScore: number | null;
      targetContentId: string;
      targetType: string;
      targetContentVersion: number | null;
      strikedBy: string;
      adminId: string | null;
      strikeComment: string | null;
      reviewedBy: string | null;
      reviewComment: string | null;
      actionTaken: string;
      isRemovingContent: boolean;
      reviewedAt: string | null;
      targetUser: {
        id: string;
        username: string;
      } | null;
      admin: {
        id: string;
        username: string;
      } | null;
      createdAt: string;
      updatedAt: string;
    }>;
    nextCursor: {
      id: string;
      createdAt: string;
    } | null;
    hasMore: boolean;
  } | null;
};

describe("GraphQL moderation strikes query", () => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const prismaModerationStrikeFindMany = vi.fn();
  const userLoaderLoadMany = vi.fn();

  const contextValue: ModerationGraphqlContext = {
    user: {
      id: "admin_1",
      role: "ADMIN",
    },
    prisma: {
      moderationStrike: {
        findMany: prismaModerationStrikeFindMany,
      },
    },
    getRedisCacheClient: () => ({
      get: redisGet,
      set: redisSet,
    }),
    loaders: {
      userLoader: {
        loadMany: userLoaderLoadMany,
      },
    },
  };

  beforeEach(() => {
    redisGet.mockReset();
    redisSet.mockReset();
    prismaModerationStrikeFindMany.mockReset();
    userLoaderLoadMany.mockReset();
  });

  it("uses cached strike pages without prisma lookup", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        strikes: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            userId: "user_1",
            aiDecision: "WARN",
            aiConfidence: 0.91,
            aiReasons: ["cached reason"],
            severity: 2,
            riskScore: 0.5,
            targetContentId: "target_1",
            targetType: "QUESTION",
            targetContentVersion: 1,
            strikedBy: "AI_MODERATION",
            adminId: null,
            strikeComment: null,
            reviewedBy: null,
            reviewComment: null,
            actionTaken: "PENDING",
            isRemovingContent: false,
            reviewedAt: null,
            targetUser: {
              id: "user_1",
              username: "targetUser",
            },
            admin: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );

    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.strikes).toEqual({
      strikes: [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          userId: "user_1",
          aiDecision: "WARN",
          aiConfidence: 0.91,
          aiReasons: ["cached reason"],
          severity: 2,
          riskScore: 0.5,
          targetContentId: "target_1",
          targetType: "QUESTION",
          targetContentVersion: 1,
          strikedBy: "AI_MODERATION",
          adminId: null,
          strikeComment: null,
          reviewedBy: null,
          reviewComment: null,
          actionTaken: "PENDING",
          isRemovingContent: false,
          reviewedAt: null,
          targetUser: {
            id: "user_1",
            username: "targetUser",
          },
          admin: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    expect(redisGet).toHaveBeenCalledWith("strikes:ALL:initial:10");
    expect(prismaModerationStrikeFindMany).not.toHaveBeenCalled();
    expect(userLoaderLoadMany).not.toHaveBeenCalled();
  });

  it("loads, hydrates, paginates, and caches strikes on a cache miss", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaModerationStrikeFindMany.mockResolvedValue([
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        userId: "user_1",
        aiDecision: "WARN",
        aiConfidence: 0.91,
        aiReasons: ["db reason"],
        severity: 2,
        riskScore: 0.5,
        targetContentId: "target_1",
        targetType: "QUESTION",
        targetContentVersion: 1,
        strikedBy: "AI_MODERATION",
        adminId: "admin_2",
        strikeComment: "manual review",
        reviewedBy: "admin_2",
        reviewComment: "keep pending",
        actionTaken: "PENDING",
        isRemovingContent: false,
        reviewedAt: new Date("2026-01-02T00:00:00.000Z"),
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        userId: "user_3",
        aiDecision: null,
        aiConfidence: null,
        aiReasons: [],
        severity: null,
        riskScore: null,
        targetContentId: "target_2",
        targetType: "ANSWER",
        targetContentVersion: null,
        strikedBy: "ADMIN_MODERATION",
        adminId: null,
        strikeComment: null,
        reviewedBy: null,
        reviewComment: null,
        actionTaken: "WARN",
        isRemovingContent: true,
        reviewedAt: null,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
    userLoaderLoadMany.mockResolvedValue([
      { id: "user_1", username: "targetUser" },
      { id: "admin_2", username: "adminUser" },
      { id: "user_3", username: "targetUserTwo" },
    ]);

    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      variables: {
        limitCount: 1,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.strikes).toEqual({
      strikes: [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          userId: "user_1",
          aiDecision: "WARN",
          aiConfidence: 0.91,
          aiReasons: ["db reason"],
          severity: 2,
          riskScore: 0.5,
          targetContentId: "target_1",
          targetType: "QUESTION",
          targetContentVersion: 1,
          strikedBy: "AI_MODERATION",
          adminId: "admin_2",
          strikeComment: "manual review",
          reviewedBy: "admin_2",
          reviewComment: "keep pending",
          actionTaken: "PENDING",
          isRemovingContent: false,
          reviewedAt: "2026-01-02T00:00:00.000Z",
          targetUser: {
            id: "user_1",
            username: "targetUser",
          },
          admin: {
            id: "admin_2",
            username: "adminUser",
          },
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      nextCursor: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      hasMore: true,
    });
    expect(prismaModerationStrikeFindMany).toHaveBeenCalledWith({
      take: 2,
      where: {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: expect.any(Object),
    });
    expect(userLoaderLoadMany).toHaveBeenCalledWith(["user_1", "admin_2"]);
    expect(redisSet).toHaveBeenCalledWith(
      "strikes:ALL:initial:1",
      expect.any(String),
      "EX",
      60 * 5,
    );
    expect(JSON.parse(redisSet.mock.calls[0][1] as string)).toEqual({
      strikes: [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          userId: "user_1",
          aiDecision: "WARN",
          aiConfidence: 0.91,
          aiReasons: ["db reason"],
          severity: 2,
          riskScore: 0.5,
          targetContentId: "target_1",
          targetType: "QUESTION",
          targetContentVersion: 1,
          strikedBy: "AI_MODERATION",
          adminId: "admin_2",
          strikeComment: "manual review",
          reviewedBy: "admin_2",
          reviewComment: "keep pending",
          actionTaken: "PENDING",
          isRemovingContent: false,
          reviewedAt: "2026-01-02T00:00:00.000Z",
          targetUser: {
            id: "user_1",
            username: "targetUser",
          },
          admin: {
            id: "admin_2",
            username: "adminUser",
          },
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      nextCursor: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      hasMore: true,
    });
  });

  it("uses AI filter and cursor pagination, normalizing invalid limits", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaModerationStrikeFindMany.mockResolvedValue([]);
    userLoaderLoadMany.mockResolvedValue([]);

    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      variables: {
        filter: "AI",
        cursor: {
          id: "123e4567-e89b-42d3-a456-426614174000",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
        limitCount: 0,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.strikes).toEqual({
      strikes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(redisGet).toHaveBeenCalledWith(
      "strikes:AI:2026-01-03T00:00:00.000Z:123e4567-e89b-42d3-a456-426614174000:10",
    );
    expect(prismaModerationStrikeFindMany).toHaveBeenCalledWith({
      take: 11,
      where: {
        strikedBy: "AI_MODERATION",
        AND: [
          {
            OR: [
              { createdAt: { lt: new Date("2026-01-03T00:00:00.000Z") } },
              {
                createdAt: new Date("2026-01-03T00:00:00.000Z"),
                id: { lt: "123e4567-e89b-42d3-a456-426614174000" },
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: expect.any(Object),
    });
  });

  it("uses the ADMIN filter", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaModerationStrikeFindMany.mockResolvedValue([]);
    userLoaderLoadMany.mockResolvedValue([]);

    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      variables: {
        filter: "ADMIN",
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.strikes).toEqual({
      strikes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(prismaModerationStrikeFindMany).toHaveBeenCalledWith({
      take: 11,
      where: {
        strikedBy: "ADMIN_MODERATION",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: expect.any(Object),
    });
  });

  it("rejects non-admin users", async () => {
    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      contextValue: {
        ...contextValue,
        user: {
          id: "user_1",
          role: "USER",
        },
      },
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Forbidden to access this route");
  });

  it("rejects invalid UUID cursors", async () => {
    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      variables: {
        cursor: {
          id: "not-a-uuid",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      },
      contextValue,
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Invalid cursor");
  });

  it("rejects invalid cursor dates", async () => {
    const result = await executeModerationGraphql<StrikesQueryResult>({
      query,
      variables: {
        cursor: {
          id: "123e4567-e89b-42d3-a456-426614174000",
          createdAt: "not-a-date",
        },
      },
      contextValue,
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Invalid cursor");
  });
});
