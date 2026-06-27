import { Redis } from "ioredis";

import HttpError from "../../../../utils/http/httpError.util.js";

import { normalizeLimitCount, parseCachedPage } from "./user.shared.helper.js";

type UserBadgeCursor = {
  awardedAt: string;
  badgeId: string;
};

type UserBadgeRecord = {
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
};

type CachedUserBadgePage = {
  badges: UserBadgeRecord[];
  nextCursor: UserBadgeCursor | null;
  hasMore: boolean;
};

type UserBadgePage = CachedUserBadgePage;

type UserBadgesContext = {
  userId: string;
  cursor?: UserBadgeCursor;
  limitCount: number;
  prisma: any;
  getRedisCacheClient: () => Redis;
};

type UserBadgeAssignment = {
  badgeId: string;
  awardedAt: Date;
  source: string | null;
};

type BadgeDetails = {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  colorKey: string | null;
  imageKey: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const CACHE_TTL_SECONDS = 60 * 15;

const buildUserBadgesCacheKey = (
  userId: string,
  cursor: UserBadgeCursor | undefined,
  limitCount: number,
) => {
  const cursorCacheKey = cursor
    ? `${cursor.awardedAt}:${cursor.badgeId}`
    : "initial";

  return `user:badges:${userId}:${cursorCacheKey}:${limitCount}`;
};

const validateCursor = (cursor: UserBadgeCursor) => {
  if (!cursor.badgeId || Number.isNaN(Date.parse(cursor.awardedAt))) {
    throw new HttpError("Invalid cursor", 400);
  }
};

const mapBadgeRecord = (
  assignment: UserBadgeAssignment,
  badge: BadgeDetails,
): UserBadgeRecord => ({
  badgeId: assignment.badgeId,
  name: badge.name,
  description: badge.description,
  iconKey: badge.iconKey,
  colorKey: badge.colorKey,
  imageKey: badge.imageKey,
  isActive: badge.isActive,
  awardedAt: assignment.awardedAt.toISOString(),
  source: assignment.source,
  createdAt: badge.createdAt.toISOString(),
  updatedAt: badge.updatedAt.toISOString(),
});

const getUserBadges = async ({
  userId,
  cursor,
  limitCount,
  prisma,
  getRedisCacheClient,
}: UserBadgesContext): Promise<UserBadgePage> => {
  const normalizedLimitCount = normalizeLimitCount(limitCount, 5);

  if (cursor) {
    validateCursor(cursor);
  }

  const cacheKey = buildUserBadgesCacheKey(
    userId,
    cursor,
    normalizedLimitCount,
  );

  const cachedBadges = await getRedisCacheClient().get(cacheKey);
  if (cachedBadges) {
    return parseCachedPage<CachedUserBadgePage>(cachedBadges);
  }

  const userBadgeAssignments = (await prisma.userBadge.findMany({
    where: {
      userId,
      ...(cursor
        ? {
            OR: [
              {
                awardedAt: {
                  lt: new Date(cursor.awardedAt),
                },
              },
              {
                awardedAt: new Date(cursor.awardedAt),
                badgeId: {
                  lt: cursor.badgeId,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ awardedAt: "desc" }, { badgeId: "desc" }],
    take: normalizedLimitCount + 1,
    select: {
      badgeId: true,
      awardedAt: true,
      source: true,
    },
  })) as UserBadgeAssignment[];

  const hasMore = userBadgeAssignments.length > normalizedLimitCount;
  const slicedAssignments = userBadgeAssignments.slice(0, normalizedLimitCount);

  const badgeIds = slicedAssignments.map(({ badgeId }) => badgeId);
  const userBadgeByBadgeId = new Map(
    slicedAssignments.map((assignment) => [assignment.badgeId, assignment]),
  );

  const badges = badgeIds.length
    ? ((await prisma.badge.findMany({
        where: {
          id: {
            in: badgeIds,
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          iconKey: true,
          colorKey: true,
          imageKey: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as BadgeDetails[])
    : [];

  const badgeById = new Map(badges.map((badge) => [badge.id, badge]));
  const mergedBadges: UserBadgeRecord[] = [];

  for (const badgeId of badgeIds) {
    const assignment = userBadgeByBadgeId.get(badgeId);
    const badge = badgeById.get(badgeId);

    if (!assignment || !badge) {
      continue;
    }

    mergedBadges.push(mapBadgeRecord(assignment, badge));
  }

  const lastBadge = mergedBadges[mergedBadges.length - 1];
  const result = {
    badges: mergedBadges,
    nextCursor:
      hasMore && lastBadge
        ? {
            awardedAt: lastBadge.awardedAt,
            badgeId: lastBadge.badgeId,
          }
        : null,
    hasMore,
  } satisfies UserBadgePage;

  await getRedisCacheClient().set(
    cacheKey,
    JSON.stringify(result),
    "EX",
    CACHE_TTL_SECONDS,
  );

  return result;
};

export { getUserBadges, type UserBadgeCursor, type UserBadgePage };
