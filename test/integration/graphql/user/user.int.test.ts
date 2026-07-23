import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserGraphqlContext } from "../../../helpers/user/executeUserGraphql.js";

const getFlattenedUserById = vi.fn();

vi.mock("../../../../src/services/user/userData.service.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/services/user/userData.service.js")
  >("../../../../src/services/user/userData.service.js");

  return {
    ...actual,
    getFlattenedUserById,
  };
});

const { default: executeUserGraphql } = await import(
  "../../../helpers/user/executeUserGraphql.js"
);

const query = `
  query User($id: String!) {
    user(id: $id) {
      id
      username
      displayName
      email
      bio
      role
      questionsAsked
      answersGiven
      bestAnswers
      status
      isVerified
      createdAt
    }
  }
`;

type UserQueryResult = {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    email: string;
    bio: string | null;
    role: string;
    questionsAsked: number;
    answersGiven: number;
    bestAnswers: number;
    status: string;
    isVerified: boolean;
    createdAt: string;
  } | null;
};

describe("GraphQL user query", () => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();

  const contextValue: UserGraphqlContext = {
    user: {
      id: "user_1",
    },
    prisma: {
      user: {},
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
    getFlattenedUserById.mockReset();
  });

  it("returns a sanitized user from cache without prisma lookup", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        id: "user_1",
        username: "cachedUser",
        displayName: "Cached User",
        email: "cached@example.com",
        bio: "Cached bio",
        role: "USER",
        questionsAsked: 3,
        answersGiven: 4,
        bestAnswers: 1,
        status: "ACTIVE",
        isVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await executeUserGraphql<UserQueryResult>({
      query,
      variables: {
        id: "user_1",
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.user).toEqual({
      id: "user_1",
      username: "cachedUser",
      displayName: "Cached User",
      email: "cached@example.com",
      bio: "Cached bio",
      role: "USER",
      questionsAsked: 3,
      answersGiven: 4,
      bestAnswers: 1,
      status: "ACTIVE",
      isVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(redisGet).toHaveBeenCalledWith("user:user_1");
    expect(getFlattenedUserById).not.toHaveBeenCalled();
  });

  it("loads, sanitizes, and caches users on a cache miss", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    getFlattenedUserById.mockResolvedValue({
      id: "user_1",
      username: "freshUser",
      email: "fresh@example.com",
      role: "USER",
      createdAt: "2026-02-01T00:00:00.000Z",
      password: "hashed-password",
      tokenVersion: 3,
      otp: "123456",
      deletedAt: null,
      auth: {
        isVerified: true,
      },
      profile: {
        displayName: "Fresh User",
        bio: "Fresh bio",
      },
      stats: {
        questionsAsked: 7,
        answersGiven: 9,
        bestAnswers: 2,
      },
      statusState: {
        status: "ACTIVE",
      },
    });

    const result = await executeUserGraphql<UserQueryResult>({
      query,
      variables: {
        id: "user_1",
      },
      contextValue,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.user).toEqual({
      id: "user_1",
      username: "freshUser",
      displayName: "Fresh User",
      email: "fresh@example.com",
      bio: "Fresh bio",
      role: "USER",
      questionsAsked: 7,
      answersGiven: 9,
      bestAnswers: 2,
      status: "ACTIVE",
      isVerified: true,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    expect(getFlattenedUserById).toHaveBeenCalledWith("user_1");
    expect(redisSet).toHaveBeenCalledWith(
      "user:user_1",
      expect.any(String),
      "EX",
      60 * 20,
    );
    expect(JSON.parse(redisSet.mock.calls[0][1])).toEqual({
      id: "user_1",
      username: "freshUser",
      email: "fresh@example.com",
      role: "USER",
      createdAt: "2026-02-01T00:00:00.000Z",
      auth: {
        isVerified: true,
      },
      profile: {
        displayName: "Fresh User",
        bio: "Fresh bio",
        profilePictureUrl: null,
        profilePictureKey: null,
      },
      stats: {
        reputationPoints: 0,
        questionsAsked: 7,
        answersGiven: 9,
        acceptedAnswers: 0,
        bestAnswers: 2,
      },
      statusState: {
        status: "ACTIVE",
        isDeleted: false,
      },
    });
  });

  it("returns not found errors when the user does not exist", async () => {
    redisGet.mockResolvedValue(null);
    getFlattenedUserById.mockResolvedValue(null);

    const result = await executeUserGraphql<UserQueryResult>({
      query,
      variables: {
        id: "missing_user",
      },
      contextValue,
    });

    expect(result.data?.user).toBeNull();
    expect(result.errors?.[0]?.message).toBe("User not found");
  });
});
