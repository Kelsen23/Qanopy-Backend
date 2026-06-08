import { beforeEach, describe, expect, it, vi } from "vitest";

import executeUserGraphql from "../../../helpers/user/executeUserGraphql.js";
import type { UserGraphqlContext } from "../../../helpers/user/executeUserGraphql.js";

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
  const prismaUserFindUnique = vi.fn();

  const contextValue: UserGraphqlContext = {
    user: {
      id: "user_1",
    },
    prisma: {
      user: {
        findUnique: prismaUserFindUnique,
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
    prismaUserFindUnique.mockReset();
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
    expect(prismaUserFindUnique).not.toHaveBeenCalled();
  });

  it("loads, sanitizes, and caches users on a cache miss", async () => {
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    prismaUserFindUnique.mockResolvedValue({
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
      password: "hashed-password",
      tokenVersion: 3,
      otp: "123456",
      deletedAt: null,
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
    expect(prismaUserFindUnique).toHaveBeenCalledWith({
      where: {
        id: "user_1",
      },
    });
    expect(redisSet).toHaveBeenCalledWith(
      "user:user_1",
      JSON.stringify({
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
      }),
      "EX",
      60 * 20,
    );
  });

  it("returns not found errors when the user does not exist", async () => {
    redisGet.mockResolvedValue(null);
    prismaUserFindUnique.mockResolvedValue(null);

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
