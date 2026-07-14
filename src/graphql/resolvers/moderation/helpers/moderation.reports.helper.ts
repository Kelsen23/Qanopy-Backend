import mongoose from "mongoose";
import { Redis } from "ioredis";

import Report from "../../../../models/report.model.js";

import {
  buildUserMap,
  ensureAdminAccess,
  normalizeLimitCount,
  parseCachedPage,
  type ModerationGraphqlUser,
  toIsoString,
  toNullableIsoString,
} from "./moderation.shared.helper.js";

type ModerationGraphqlContext = {
  user: {
    id: string;
    role: string;
  };
  loaders: {
    userLoader: {
      loadMany: (keys: readonly string[]) => Promise<unknown[]>;
    };
  };
  getRedisCacheClient: () => Redis;
};

type ReportCursor = {
  id: string;
};

type ReportRecord = {
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
  createdAt: string;
  updatedAt: string;
  reporter?: ModerationGraphqlUser | null;
  targetUser?: ModerationGraphqlUser | null;
};

type ReportPage = {
  reports: ReportRecord[];
  nextCursor: ReportCursor | null;
  hasMore: boolean;
};

type CachedReportPage = {
  reports: ReportRecord[];
  nextCursor: ReportCursor | null;
  hasMore: boolean;
};

const CACHE_TTL_SECONDS = 60 * 5;

const normalizeModerationTargetType = (value: unknown) =>
  String(value)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();

const buildReportCacheKey = (
  cursorId: string | undefined,
  showReviewed: boolean,
  limitCount: number,
) => {
  const cursorCacheKey = cursorId ?? "initial";

  return `reports:${showReviewed ? "reviewed" : "pending"}:${cursorCacheKey}:${limitCount}`;
};

const normalizeReportRecord = (report: {
  id: unknown;
  reportedBy: unknown;
  targetUserId: unknown;
  targetId: unknown;
  targetContentVersion: unknown;
  targetType: unknown;
  reportReason: unknown;
  reportComment: unknown;
  reviewedBy: unknown;
  reviewComment: unknown;
  actionTaken: unknown;
  isRemovingContent: unknown;
  reviewedAt: unknown;
  status: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}): ReportRecord => ({
  id: String(report.id),
  reportedBy: String(report.reportedBy),
  targetUserId: String(report.targetUserId),
  targetId: String(report.targetId),
  targetContentVersion:
    report.targetContentVersion === null ||
    report.targetContentVersion === undefined
      ? null
      : Number(report.targetContentVersion),
  targetType: normalizeModerationTargetType(report.targetType),
  reportReason: String(report.reportReason),
  reportComment:
    report.reportComment === null || report.reportComment === undefined
      ? null
      : String(report.reportComment),
  reviewedBy:
    report.reviewedBy === null || report.reviewedBy === undefined
      ? null
      : String(report.reviewedBy),
  reviewComment:
    report.reviewComment === null || report.reviewComment === undefined
      ? null
      : String(report.reviewComment),
  actionTaken: String(report.actionTaken),
  isRemovingContent: Boolean(report.isRemovingContent),
  reviewedAt: toNullableIsoString(report.reviewedAt),
  status: String(report.status),
  createdAt: toIsoString(report.createdAt),
  updatedAt: toIsoString(report.updatedAt),
});

type GetReportsInput = {
  cursor?: ReportCursor;
  limitCount: number;
  showReviewed: boolean;
  user: ModerationGraphqlContext["user"];
  loaders: ModerationGraphqlContext["loaders"];
  getRedisCacheClient: ModerationGraphqlContext["getRedisCacheClient"];
};

const getReports = async ({
  cursor,
  limitCount,
  showReviewed,
  user,
  loaders,
  getRedisCacheClient,
}: GetReportsInput) => {
  ensureAdminAccess(user.role);

  const normalizedLimitCount = normalizeLimitCount(limitCount);

  if (cursor && !mongoose.isValidObjectId(cursor.id)) {
    throw new Error("Invalid cursor");
  }

  const cacheKey = buildReportCacheKey(
    cursor?.id,
    showReviewed,
    normalizedLimitCount,
  );

  const cachedReports = await getRedisCacheClient().get(cacheKey);
  if (cachedReports) {
    return parseCachedPage<CachedReportPage>(cachedReports);
  }

  const matchStage: Record<string, unknown> = showReviewed
    ? { actionTaken: { $ne: "PENDING" } }
    : { actionTaken: "PENDING" };

  if (cursor) {
    matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor.id) };
  }

  const foundReports = await Report.aggregate([
    { $match: matchStage },
    { $sort: { _id: -1 } },
    { $limit: normalizedLimitCount + 1 },
    {
      $project: {
        id: { $toString: "$_id" },
        _id: 0,
        reportedBy: 1,
        targetUserId: 1,
        targetId: { $toString: "$targetId" },
        targetContentVersion: 1,
        targetType: 1,
        reportReason: 1,
        reportComment: 1,
        reviewedBy: 1,
        reviewComment: 1,
        reviewedAt: 1,
        actionTaken: 1,
        isRemovingContent: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  const hasMore = foundReports.length > normalizedLimitCount;
  const reportPage = foundReports
    .slice(0, normalizedLimitCount)
    .map(normalizeReportRecord);

  const userMap = await buildUserMap(
    reportPage.flatMap((report) => [report.reportedBy, report.targetUserId]),
    loaders,
  );

  const reports = reportPage.map((report) => ({
    ...report,
    reporter: userMap.get(report.reportedBy) ?? null,
    targetUser: userMap.get(report.targetUserId) ?? null,
  }));

  const result: ReportPage = {
    reports,
    nextCursor:
      hasMore && reports.length ? { id: reports[reports.length - 1].id } : null,
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

export type { ReportCursor, ReportPage, ModerationGraphqlContext };
export default getReports;
