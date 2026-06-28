import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
}));

vi.mock("../../../../src/models/report.model.js", () => ({
  default: {
    aggregate: mocks.aggregate,
  },
}));

import executeModerationGraphql from "../../../helpers/moderation/executeModerationGraphql.js";
import type { ModerationGraphqlContext } from "../../../helpers/moderation/executeModerationGraphql.js";

const query = `
  query Reports($cursor: ReportCursorInput, $limitCount: Int, $showReviewed: Boolean) {
    reports(cursor: $cursor, limitCount: $limitCount, showReviewed: $showReviewed) {
      reports {
        id
        reportedBy
        targetUserId
        targetId
        targetContentVersion
        targetType
        reportReason
        reportComment
        reviewedBy
        reviewComment
        actionTaken
        isRemovingContent
        reviewedAt
        status
        reporter {
          id
          username
        }
        targetUser {
          id
          username
        }
        createdAt
        updatedAt
      }
      nextCursor {
        id
      }
      hasMore
    }
  }
`;

type ReportsQueryResult = {
  reports: {
    reports: Array<{
      id: string;
      reportedBy: string;
      targetUserId: string;
      targetId: string;
      targetContentVersion: number | null;
      targetType: string;
      reportReason: string;
      reportComment: string | null;
      reviewedBy: string | null;
      reviewComment: string | null;
      actionTaken: string;
      isRemovingContent: boolean;
      reviewedAt: string | null;
      status: string;
      reporter: {
        id: string;
        username: string;
      } | null;
      targetUser: {
        id: string;
        username: string;
      } | null;
      createdAt: string;
      updatedAt: string;
    }>;
    nextCursor: {
      id: string;
    } | null;
    hasMore: boolean;
  } | null;
};

describe("GraphQL moderation reports query", () => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const userLoaderLoadMany = vi.fn();

  const contextValue: ModerationGraphqlContext = {
    user: {
      id: "admin_1",
      role: "ADMIN",
    },
    prisma: {},
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
    userLoaderLoadMany.mockReset();
    mocks.aggregate.mockReset();
  });

  it("uses cached pending report pages without aggregate lookup", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        reports: [
          {
            id: "507f1f77bcf86cd799439011",
            reportedBy: "user_1",
            targetUserId: "user_2",
            targetId: "507f1f77bcf86cd799439012",
            targetContentVersion: 2,
            targetType: "QUESTION",
            reportReason: "SPAM",
            reportComment: "Cached comment",
            reviewedBy: null,
            reviewComment: null,
            actionTaken: "PENDING",
            isRemovingContent: false,
            reviewedAt: null,
            status: "PENDING",
            reporter: {
              id: "user_1",
              username: "reporterUser",
            },
            targetUser: {
              id: "user_2",
              username: "targetUser",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );

    const result = await executeModerationGraphql<ReportsQueryResult>({
      query,
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reports).toEqual({
      reports: [
        {
          id: "507f1f77bcf86cd799439011",
          reportedBy: "user_1",
          targetUserId: "user_2",
          targetId: "507f1f77bcf86cd799439012",
          targetContentVersion: 2,
          targetType: "QUESTION",
          reportReason: "SPAM",
          reportComment: "Cached comment",
          reviewedBy: null,
          reviewComment: null,
          actionTaken: "PENDING",
          isRemovingContent: false,
          reviewedAt: null,
          status: "PENDING",
          reporter: {
            id: "user_1",
            username: "reporterUser",
          },
          targetUser: {
            id: "user_2",
            username: "targetUser",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    expect(redisGet).toHaveBeenCalledWith("reports:pending:initial:10");
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(userLoaderLoadMany).not.toHaveBeenCalled();
  });

  it("loads, hydrates, paginates, and caches pending reports on a cache miss", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    mocks.aggregate.mockResolvedValue([
      {
        id: "507f1f77bcf86cd799439013",
        reportedBy: "user_1",
        targetUserId: "user_2",
        targetId: "507f1f77bcf86cd799439099",
        targetContentVersion: 3,
        targetType: "question",
        reportReason: "SPAM",
        reportComment: "DB comment",
        reviewedBy: null,
        reviewComment: null,
        reviewedAt: null,
        actionTaken: "PENDING",
        isRemovingContent: false,
        status: "PENDING",
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "507f1f77bcf86cd799439012",
        reportedBy: "user_3",
        targetUserId: "user_2",
        targetId: "507f1f77bcf86cd799439098",
        targetContentVersion: null,
        targetType: "AIAnswerFeedback",
        reportReason: "OTHER",
        reportComment: null,
        reviewedBy: null,
        reviewComment: null,
        reviewedAt: null,
        actionTaken: "PENDING",
        isRemovingContent: false,
        status: "PENDING",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    userLoaderLoadMany.mockResolvedValue([
      { id: "user_1", username: "reporterOne" },
      { id: "user_2", username: "targetUser" },
      { id: "user_3", username: "reporterTwo" },
    ]);

    const result = await executeModerationGraphql<ReportsQueryResult>({
      query,
      variables: {
        limitCount: 1,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reports).toEqual({
      reports: [
        {
          id: "507f1f77bcf86cd799439013",
          reportedBy: "user_1",
          targetUserId: "user_2",
          targetId: "507f1f77bcf86cd799439099",
          targetContentVersion: 3,
          targetType: "QUESTION",
          reportReason: "SPAM",
          reportComment: "DB comment",
          reviewedBy: null,
          reviewComment: null,
          actionTaken: "PENDING",
          isRemovingContent: false,
          reviewedAt: null,
          status: "PENDING",
          reporter: {
            id: "user_1",
            username: "reporterOne",
          },
          targetUser: {
            id: "user_2",
            username: "targetUser",
          },
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      nextCursor: {
        id: "507f1f77bcf86cd799439013",
      },
      hasMore: true,
    });
    expect(mocks.aggregate).toHaveBeenCalledWith([
      { $match: { actionTaken: "PENDING" } },
      { $sort: { _id: -1 } },
      { $limit: 2 },
      expect.any(Object),
    ]);
    expect(userLoaderLoadMany).toHaveBeenCalledWith(["user_1", "user_2"]);
    expect(redisSet).toHaveBeenCalledWith(
      "reports:pending:initial:1",
      JSON.stringify({
        reports: [
          {
            id: "507f1f77bcf86cd799439013",
            reportedBy: "user_1",
            targetUserId: "user_2",
            targetId: "507f1f77bcf86cd799439099",
            targetContentVersion: 3,
            targetType: "QUESTION",
            reportReason: "SPAM",
            reportComment: "DB comment",
            reviewedBy: null,
            reviewComment: null,
            actionTaken: "PENDING",
            isRemovingContent: false,
            reviewedAt: null,
            status: "PENDING",
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
            reporter: {
              id: "user_1",
              username: "reporterOne",
            },
            targetUser: {
              id: "user_2",
              username: "targetUser",
            },
          },
        ],
        nextCursor: {
          id: "507f1f77bcf86cd799439013",
        },
        hasMore: true,
      }),
      "EX",
      60 * 5,
    );
  });

  it("uses reviewed mode and cursor filtering", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    mocks.aggregate.mockResolvedValue([]);
    userLoaderLoadMany.mockResolvedValue([]);

    const result = await executeModerationGraphql<ReportsQueryResult>({
      query,
      variables: {
        cursor: {
          id: "507f1f77bcf86cd799439011",
        },
        limitCount: -1,
        showReviewed: true,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reports).toEqual({
      reports: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(redisGet).toHaveBeenCalledWith(
      "reports:reviewed:507f1f77bcf86cd799439011:10",
    );
    expect(mocks.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          actionTaken: { $ne: "PENDING" },
          _id: { $lt: expect.anything() },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 11 },
      expect.any(Object),
    ]);
    expect(redisSet).toHaveBeenCalledWith(
      "reports:reviewed:507f1f77bcf86cd799439011:10",
      JSON.stringify({
        reports: [],
        nextCursor: null,
        hasMore: false,
      }),
      "EX",
      60 * 5,
    );
  });

  it("rejects non-admin users", async () => {
    const result = await executeModerationGraphql<ReportsQueryResult>({
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

  it("rejects invalid cursors", async () => {
    const result = await executeModerationGraphql<ReportsQueryResult>({
      query,
      variables: {
        cursor: {
          id: "not-an-object-id",
        },
      },
      contextValue,
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Invalid cursor");
  });
});
