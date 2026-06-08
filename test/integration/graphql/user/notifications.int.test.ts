import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
}));

vi.mock("../../../../src/models/notification.model.js", () => ({
  default: {
    aggregate: mocks.aggregate,
    countDocuments: mocks.countDocuments,
  },
}));

import executeUserGraphql from "../../../helpers/user/executeUserGraphql.js";
import type { UserGraphqlContext } from "../../../helpers/user/executeUserGraphql.js";

const query = `
  query Notifications($cursor: NotificationCursorInput, $limitCount: Int) {
    notifications(cursor: $cursor, limitCount: $limitCount) {
      notifications {
        id
        recipientId
        actorId
        actor {
          id
          username
        }
        event
        target {
          entityType
          entityId
          parentId
          questionVersion
        }
        meta
        seen
        createdAt
        updatedAt
      }
      nextCursor {
        id
        createdAt
      }
      hasMore
      unreadCount
    }
  }
`;

type NotificationsQueryResult = {
  notifications: {
    notifications: Array<{
      id: string;
      recipientId: string;
      actorId: string | null;
      actor: {
        id: string;
        username: string;
      } | null;
      event: string;
      target: {
        entityType: string;
        entityId: string;
        parentId: string | null;
        questionVersion: number | null;
      };
      meta: Record<string, unknown>;
      seen: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    nextCursor: {
      id: string;
      createdAt: string;
    } | null;
    hasMore: boolean;
    unreadCount: number;
  } | null;
};

describe("GraphQL notifications query", () => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const userLoaderLoadMany = vi.fn();

  const contextValue: UserGraphqlContext = {
    user: {
      id: "user_1",
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
    mocks.countDocuments.mockReset();
  });

  it("uses cached notification pages and hydrates actors", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        notifications: [
          {
            id: "507f1f77bcf86cd799439011",
            recipientId: "user_1",
            actorId: "actor_1",
            event: "UPVOTE",
            target: {
              entityType: "QUESTION",
              entityId: "question_1",
              parentId: null,
              questionVersion: null,
            },
            meta: {
              source: "cached",
            },
            seen: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "507f1f77bcf86cd799439012",
            recipientId: "user_1",
            actorId: null,
            event: "REPLY_CREATED",
            target: {
              entityType: "ANSWER",
              entityId: "answer_1",
              parentId: "question_1",
              questionVersion: 2,
            },
            meta: {},
            seen: true,
            createdAt: "2026-01-01T00:01:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
        unreadCount: 1,
      }),
    );
    userLoaderLoadMany.mockResolvedValue([
      {
        id: "actor_1",
        username: "actorUser",
      },
    ]);

    const result = await executeUserGraphql<NotificationsQueryResult>({
      query,
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.notifications).toEqual({
      notifications: [
        {
          id: "507f1f77bcf86cd799439011",
          recipientId: "user_1",
          actorId: "actor_1",
          actor: {
            id: "actor_1",
            username: "actorUser",
          },
          event: "UPVOTE",
          target: {
            entityType: "QUESTION",
            entityId: "question_1",
            parentId: null,
            questionVersion: null,
          },
          meta: {
            source: "cached",
          },
          seen: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "507f1f77bcf86cd799439012",
          recipientId: "user_1",
          actorId: null,
          actor: null,
          event: "REPLY_CREATED",
          target: {
            entityType: "ANSWER",
            entityId: "answer_1",
            parentId: "question_1",
            questionVersion: 2,
          },
          meta: {},
          seen: true,
          createdAt: "2026-01-01T00:01:00.000Z",
          updatedAt: "2026-01-01T00:01:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
      unreadCount: 1,
    });
    expect(redisGet).toHaveBeenCalledWith("notifications:user_1:initial:10");
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(userLoaderLoadMany).toHaveBeenCalledWith(["actor_1"]);
  });

  it("loads notifications on a cache miss, caches them, and returns pagination metadata", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    mocks.aggregate.mockResolvedValue([
      {
        id: "507f1f77bcf86cd799439011",
        recipientId: "user_1",
        actorId: "actor_1",
        event: "UPVOTE",
        target: {
          entityType: "QUESTION",
          entityId: "question_1",
          parentId: null,
          questionVersion: null,
        },
        meta: {
          source: "db",
        },
        seen: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "507f1f77bcf86cd799439012",
        recipientId: "user_1",
        actorId: "actor_2",
        event: "DOWNVOTE",
        target: {
          entityType: "ANSWER",
          entityId: "answer_1",
          parentId: "question_1",
          questionVersion: 3,
        },
        meta: {},
        seen: true,
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    mocks.countDocuments.mockResolvedValue(4);
    userLoaderLoadMany.mockResolvedValue([
      {
        id: "actor_1",
        username: "actorOne",
      },
    ]);

    const result = await executeUserGraphql<NotificationsQueryResult>({
      query,
      variables: {
        limitCount: 1,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.notifications).toEqual({
      notifications: [
        {
          id: "507f1f77bcf86cd799439011",
          recipientId: "user_1",
          actorId: "actor_1",
          actor: {
            id: "actor_1",
            username: "actorOne",
          },
          event: "UPVOTE",
          target: {
            entityType: "QUESTION",
            entityId: "question_1",
            parentId: null,
            questionVersion: null,
          },
          meta: {
            source: "db",
          },
          seen: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: {
        id: "507f1f77bcf86cd799439011",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      hasMore: true,
      unreadCount: 4,
    });
    expect(mocks.countDocuments).toHaveBeenCalledWith({
      recipientId: "user_1",
      seen: false,
    });
    expect(redisSet).toHaveBeenCalledWith(
      "notifications:user_1:initial:1",
      JSON.stringify({
        notifications: [
          {
            id: "507f1f77bcf86cd799439011",
            recipientId: "user_1",
            actorId: "actor_1",
            event: "UPVOTE",
            target: {
              entityType: "QUESTION",
              entityId: "question_1",
              parentId: null,
              questionVersion: null,
            },
            meta: {
              source: "db",
            },
            seen: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: {
          id: "507f1f77bcf86cd799439011",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        hasMore: true,
        unreadCount: 4,
      }),
      "EX",
      60 * 2,
    );
  });

  it("applies the default limit when limitCount is invalid", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    mocks.aggregate.mockResolvedValue([]);
    mocks.countDocuments.mockResolvedValue(0);
    userLoaderLoadMany.mockResolvedValue([]);

    const result = await executeUserGraphql<NotificationsQueryResult>({
      query,
      variables: {
        limitCount: -1,
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    const pipeline = mocks.aggregate.mock.calls[0][0];
    expect(pipeline[2]).toEqual({
      $limit: 11,
    });
    expect(redisGet).toHaveBeenCalledWith("notifications:user_1:initial:10");
  });

  it("rejects invalid cursors", async () => {
    const result = await executeUserGraphql<NotificationsQueryResult>({
      query,
      variables: {
        cursor: {
          id: "bad-id",
          createdAt: "not-a-date",
        },
      },
      contextValue,
    });

    expect(result.data?.notifications).toBeNull();
    expect(result.errors?.[0]?.message).toBe("Invalid cursor");
  });
});
