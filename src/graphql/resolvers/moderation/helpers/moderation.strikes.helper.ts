import { Redis } from "ioredis";

import {
  buildUserMap,
  ensureAdminAccess,
  normalizeLimitCount,
  parseCachedPage,
  type ModerationGraphqlUser,
  toIsoString,
  toNullableIsoString,
} from "./moderation.shared.helper.js";

import HttpError from "../../../../utils/http/httpError.util.js";

type ModerationGraphqlStrikeContext = {
  user: {
    id: string;
    role: string;
  };
  loaders: {
    userLoader: {
      loadMany: (keys: readonly string[]) => Promise<unknown[]>;
    };
  };
  prisma: any;
  getRedisCacheClient: () => Redis;
};

type StrikeCursor = {
  id: string;
  createdAt: string;
};

type StrikeRecord = {
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
  createdAt: string;
  updatedAt: string;
  targetUser?: ModerationGraphqlUser | null;
  admin?: ModerationGraphqlUser | null;
};

type StrikePage = {
  strikes: StrikeRecord[];
  nextCursor: StrikeCursor | null;
  hasMore: boolean;
};

type CachedStrikePage = {
  strikes: StrikeRecord[];
  nextCursor: StrikeCursor | null;
  hasMore: boolean;
};

type FoundStrikeRecord = {
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
  reviewedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const CACHE_TTL_SECONDS = 60 * 5;

const buildStrikeCacheKey = (
  filter: "AI" | "ADMIN" | "ALL",
  cursor: StrikeCursor | undefined,
  limitCount: number,
) => {
  const cursorCacheKey = cursor
    ? `${cursor.createdAt}:${cursor.id}`
    : "initial";

  return `strikes:${filter}:${cursorCacheKey}:${limitCount}`;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const validateCursor = (cursor: StrikeCursor) => {
  if (!isUuid(cursor.id) || Number.isNaN(Date.parse(cursor.createdAt))) {
    throw new HttpError("Invalid cursor", 400);
  }
};

const normalizeStrikeRecord = (strike: {
  id: unknown;
  userId: unknown;
  aiDecision: unknown;
  aiConfidence: unknown;
  aiReasons: unknown;
  severity: unknown;
  riskScore: unknown;
  targetContentId: unknown;
  targetType: unknown;
  targetContentVersion: unknown;
  strikedBy: unknown;
  adminId: unknown;
  strikeComment: unknown;
  reviewedBy: unknown;
  reviewComment: unknown;
  actionTaken: unknown;
  isRemovingContent: unknown;
  reviewedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}): StrikeRecord => ({
  id: String(strike.id),
  userId: String(strike.userId),
  aiDecision:
    strike.aiDecision === null || strike.aiDecision === undefined
      ? null
      : String(strike.aiDecision),
  aiConfidence:
    strike.aiConfidence === null || strike.aiConfidence === undefined
      ? null
      : Number(strike.aiConfidence),
  aiReasons: Array.isArray(strike.aiReasons)
    ? strike.aiReasons.map((reason) => String(reason))
    : [],
  severity:
    strike.severity === null || strike.severity === undefined
      ? null
      : Number(strike.severity),
  riskScore:
    strike.riskScore === null || strike.riskScore === undefined
      ? null
      : Number(strike.riskScore),
  targetContentId: String(strike.targetContentId),
  targetType: String(strike.targetType),
  targetContentVersion:
    strike.targetContentVersion === null ||
    strike.targetContentVersion === undefined
      ? null
      : Number(strike.targetContentVersion),
  strikedBy: String(strike.strikedBy),
  adminId:
    strike.adminId === null || strike.adminId === undefined
      ? null
      : String(strike.adminId),
  strikeComment:
    strike.strikeComment === null || strike.strikeComment === undefined
      ? null
      : String(strike.strikeComment),
  reviewedBy:
    strike.reviewedBy === null || strike.reviewedBy === undefined
      ? null
      : String(strike.reviewedBy),
  reviewComment:
    strike.reviewComment === null || strike.reviewComment === undefined
      ? null
      : String(strike.reviewComment),
  actionTaken: String(strike.actionTaken),
  isRemovingContent: Boolean(strike.isRemovingContent),
  reviewedAt: toNullableIsoString(strike.reviewedAt),
  createdAt: toIsoString(strike.createdAt),
  updatedAt: toIsoString(strike.updatedAt),
});

type GetStrikesInput = {
  filter?: "AI" | "ADMIN" | "ALL";
  cursor?: StrikeCursor;
  limitCount: number;
  user: ModerationGraphqlStrikeContext["user"];
  loaders: ModerationGraphqlStrikeContext["loaders"];
  prisma: ModerationGraphqlStrikeContext["prisma"];
  getRedisCacheClient: ModerationGraphqlStrikeContext["getRedisCacheClient"];
};

const getStrikes = async ({
  filter = "ALL",
  cursor,
  limitCount,
  user,
  loaders,
  prisma,
  getRedisCacheClient,
}: GetStrikesInput) => {
  ensureAdminAccess(user.role);

  const normalizedLimitCount = normalizeLimitCount(limitCount);

  if (cursor) {
    validateCursor(cursor);
  }

  const cacheKey = buildStrikeCacheKey(filter, cursor, normalizedLimitCount);

  const cachedStrikes = await getRedisCacheClient().get(cacheKey);
  if (cachedStrikes) {
    return parseCachedPage<CachedStrikePage>(cachedStrikes);
  }

  const where: Record<string, unknown> = {};
  const andConditions: Array<Record<string, unknown>> = [];

  if (filter === "AI") {
    where.strikedBy = "AI_MODERATION";
  } else if (filter === "ADMIN") {
    where.strikedBy = "ADMIN_MODERATION";
  }

  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);

    andConditions.push({
      OR: [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: cursor.id } },
      ],
    });
  }

  if (andConditions.length) {
    where.AND = andConditions;
  }

  const foundStrikes = (await prisma.moderationStrike.findMany({
    take: normalizedLimitCount + 1,
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      userId: true,
      aiDecision: true,
      aiConfidence: true,
      aiReasons: true,
      severity: true,
      riskScore: true,
      targetContentId: true,
      targetType: true,
      targetContentVersion: true,
      strikedBy: true,
      adminId: true,
      strikeComment: true,
      reviewedBy: true,
      reviewComment: true,
      actionTaken: true,
      isRemovingContent: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as FoundStrikeRecord[];

  const hasMore = foundStrikes.length > normalizedLimitCount;
  const strikePage = foundStrikes
    .slice(0, normalizedLimitCount)
    .map(normalizeStrikeRecord);

  if (!strikePage.length) {
    const emptyResult: StrikePage = {
      strikes: [],
      nextCursor: null,
      hasMore: false,
    };

    await getRedisCacheClient().set(
      cacheKey,
      JSON.stringify(emptyResult),
      "EX",
      CACHE_TTL_SECONDS,
    );

    return emptyResult;
  }

  const userMap = await buildUserMap(
    strikePage.flatMap((strike) =>
      strike.adminId ? [strike.userId, strike.adminId] : [strike.userId],
    ),
    loaders,
  );

  const strikes = strikePage.map((strike) => ({
    ...strike,
    targetUser: userMap.get(strike.userId) ?? null,
    admin: strike.adminId ? (userMap.get(strike.adminId) ?? null) : null,
  }));

  const lastStrike = strikes[strikes.length - 1];

  const result: StrikePage = {
    strikes,
    nextCursor:
      hasMore && lastStrike
        ? {
            id: lastStrike.id,
            createdAt: lastStrike.createdAt,
          }
        : null,
    hasMore,
  };

  await getRedisCacheClient().set(
    cacheKey,
    JSON.stringify(result),
    "EX",
    CACHE_TTL_SECONDS,
  );

  return result;
};

export type { StrikeCursor, StrikePage, ModerationGraphqlStrikeContext };
export default getStrikes;
