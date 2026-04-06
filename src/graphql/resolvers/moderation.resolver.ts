import mongoose from "mongoose";

import { Redis } from "ioredis";

import Report from "../../models/report.model.js";

import { User } from "../../generated/prisma/index.js";
import HttpError from "../../utils/httpError.util.js";

type ReportCursor = {
  id: string;
};

type StrikeCursor = {
  id: string;
  createdAt: string;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const moderationResolver = {
  Query: {
    reports: async (
      _: any,
      {
        cursor,
        limitCount = 10,
        showReviewed = false,
      }: { cursor?: ReportCursor; limitCount: number; showReviewed: boolean },
      {
        user,
        loaders,
        getRedisCacheClient,
      }: { user: User; loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      if (user.role !== "ADMIN")
        throw new HttpError("Forbidden to access this route", 403);

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;
      const cursorCacheKey = cursor ? cursor.id : "initial";
      const cacheKey = `reports:${showReviewed ? "reviewed" : "pending"}:${cursorCacheKey}:${normalizedLimitCount}`;

      const cachedReports = await getRedisCacheClient().get(cacheKey);

      if (cachedReports) return JSON.parse(cachedReports);

      const matchStage: any = {};

      if (!showReviewed) {
        matchStage.actionTaken = "PENDING";
      } else {
        matchStage.actionTaken = { $ne: "PENDING" };
      }

      if (cursor) {
        if (!mongoose.isValidObjectId(cursor.id))
          throw new HttpError("Invalid cursor", 400);

        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor.id) };
      }

      const foundReports = await Report.aggregate([
        { $match: matchStage },

        { $sort: { _id: -1 } },

        { $limit: normalizedLimitCount },

        {
          $project: {
            id: { $toString: "$_id" },
            _id: 0,
            reportedBy: 1,
            targetUserId: 1,
            targetId: { $toString: "$targetId" },
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

      const uniqueUserIds = [
        ...new Set(foundReports.flatMap((r) => [r.reportedBy, r.targetUserId])),
      ];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(uniqueUserIds.map((id, i) => [id, users[i]]));

      const reportsWithUsers = foundReports.map((report) => ({
        ...report,
        targetType: String(report.targetType)
          .replace(/([a-z])([A-Z])/g, "$1_$2")
          .toUpperCase(),
        reviewedAt: report.reviewedAt
          ? new Date(report.reviewedAt).toISOString()
          : null,
        createdAt: new Date(report.createdAt).toISOString(),
        updatedAt: new Date(report.updatedAt).toISOString(),
        reporter:
          userMap.get(report.reportedBy) || null,
        targetUser:
          userMap.get(report.targetUserId) || null,
      }));

      const result = {
        reports: reportsWithUsers,
        nextCursor:
          foundReports.length === normalizedLimitCount
            ? { id: foundReports[foundReports.length - 1].id }
            : null,
        hasMore: foundReports.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },

    strikes: async (
      _: any,
      {
        filter = "ALL",
        cursor,
        limitCount = 10,
        showExpired = false,
      }: {
        filter?: "AI" | "ADMIN" | "ALL";
        cursor?: StrikeCursor;
        limitCount: number;
        showExpired: boolean;
      },
      {
        user,
        loaders,
        prisma,
        getRedisCacheClient,
      }: {
        user: User;
        loaders: any;
        prisma: any;
        getRedisCacheClient: () => Redis;
      },
    ) => {
      if (user.role !== "ADMIN")
        throw new HttpError("Forbidden to access this route", 403);

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;
      const cursorCacheKey = cursor
        ? `${cursor.createdAt}:${cursor.id}`
        : "initial";
      const cacheKey = `strikes:${filter}:${showExpired ? "expired" : "active"}:${cursorCacheKey}:${normalizedLimitCount}`;
      const cachedStrikes = await getRedisCacheClient().get(cacheKey);

      if (cachedStrikes) return JSON.parse(cachedStrikes);

      const where: any = {};
      const andConditions: any[] = [];

      if (filter === "AI") where.strikedBy = "AI_MODERATION";
      else if (filter === "ADMIN") where.strikedBy = "ADMIN_MODERATION";

      const now = new Date();
      if (!showExpired)
        andConditions.push({
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        });
      else andConditions.push({ expiresAt: { lt: now } });

      if (cursor) {
        if (!isUuid(cursor.id)) throw new HttpError("Invalid cursor", 400);

        const cursorDate = new Date(cursor.createdAt);
        if (Number.isNaN(cursorDate.getTime()))
          throw new HttpError("Invalid cursor", 400);

        andConditions.push({
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: cursor.id } },
          ],
        });
      }

      if (andConditions.length) where.AND = andConditions;

      const foundStrikes = await prisma.moderationStrike.findMany({
        take: normalizedLimitCount,
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      if (!foundStrikes.length)
        return { strikes: [], nextCursor: null, hasMore: false };

      const uniqueUserIds = [
        ...new Set(
          foundStrikes.flatMap((s: any) =>
            s.adminId ? [s.userId, s.adminId] : [s.userId],
          ),
        ),
      ];

      const users = await loaders.userLoader.loadMany(uniqueUserIds);

      const userMap = new Map(uniqueUserIds.map((id, i) => [id, users[i]]));

      const strikesWithUsers = foundStrikes.map((s: any) => ({
        ...s,
        expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.updatedAt).toISOString(),
        targetUser: userMap.get(s.userId) || null,
        admin: s.adminId
          ? userMap.get(s.adminId) || null
          : null,
      }));

      const result = {
        strikes: strikesWithUsers,
        nextCursor:
          strikesWithUsers.length === normalizedLimitCount
            ? {
                id: strikesWithUsers[strikesWithUsers.length - 1].id,
                createdAt:
                  strikesWithUsers[strikesWithUsers.length - 1].createdAt,
              }
            : null,
        hasMore: strikesWithUsers.length === normalizedLimitCount,
      };

      await getRedisCacheClient().set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },
  },
};

export default moderationResolver;
