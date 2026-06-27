import HttpError from "../../../../utils/http/httpError.util.js";

type ModerationGraphqlUser = {
  id: string;
  [key: string]: unknown;
};

type ModerationGraphqlLoaderContext = {
  userLoader: {
    loadMany: (keys: readonly string[]) => Promise<unknown[]>;
  };
};

const DEFAULT_LIMIT_COUNT = 10;

const normalizeLimitCount = (limitCount: number) =>
  Number.isInteger(limitCount) && limitCount > 0
    ? Number(limitCount)
    : DEFAULT_LIMIT_COUNT;

const ensureAdminAccess = (role: string) => {
  if (role !== "ADMIN") {
    throw new HttpError("Forbidden to access this route", 403);
  }
};

const parseCachedPage = <T>(cachedPage: string) => JSON.parse(cachedPage) as T;

const toIsoString = (value: unknown) => new Date(value as string).toISOString();

const toNullableIsoString = (value: unknown) =>
  value ? new Date(value as string).toISOString() : null;

const isModerationGraphqlUser = (
  value: unknown,
): value is ModerationGraphqlUser =>
  value !== null &&
  value !== undefined &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "id" in value &&
  typeof (value as Record<string, unknown>).id === "string";

const buildUserMap = async (
  userIds: readonly string[],
  loaders: ModerationGraphqlLoaderContext,
) => {
  const uniqueUserIds = [...new Set(userIds)].filter(
    (userId): userId is string => Boolean(userId),
  );

  if (!uniqueUserIds.length) {
    return new Map<string, ModerationGraphqlUser | null>();
  }

  const loadedUsers = await loaders.userLoader.loadMany(uniqueUserIds);

  return new Map(
    uniqueUserIds.map((userId, index) => {
      const loadedUser = loadedUsers[index];

      return [
        userId,
        isModerationGraphqlUser(loadedUser) ? loadedUser : null,
      ] as const;
    }),
  );
};

export {
  buildUserMap,
  ensureAdminAccess,
  normalizeLimitCount,
  parseCachedPage,
  toIsoString,
  toNullableIsoString,
};
export type { ModerationGraphqlUser };
