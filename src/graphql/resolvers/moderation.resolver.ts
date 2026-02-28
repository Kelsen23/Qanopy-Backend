import mongoose from "mongoose";

import { Redis } from "ioredis";

import Report from "../../models/report.model.js";

import { User } from "../../generated/prisma/index.js";
import HttpError from "../../utils/httpError.util.js";

const getDeletedUserFallback = (id: string) => ({
  id,
  username: "Deleted User",
  email: "deleted@user.com",
  profilePictureKey: null,
  profilePictureUrl: null,
  bio: null,
  reputationPoints: 0,
  role: "USER",
  questionsAsked: 0,
  answersGiven: 0,
  bestAnswers: 0,
  achievements: [],
  status: "TERMINATED",
  isVerified: false,
  createdAt: new Date(0).toISOString(),
});

const moderationResolver = {
  Query: {
    getReports: async (
      _: any,
      {
        cursor,
        limitCount = 10,
        showReviewed = false,
      }: { cursor?: string; limitCount: number; showReviewed: boolean },
      {
        user,
        loaders,
        getRedisCacheClient,
      }: { user: User; loaders: any; getRedisCacheClient: () => Redis },
    ) => {
      if (user.role !== "ADMIN")
        throw new HttpError("Forbidden to access this route", 403);

      const cacheKey = `reports:${cursor || "initial"}:${limitCount}`;

      const cachedReports = await getRedisCacheClient().get(cacheKey);

      if (cachedReports) return JSON.parse(cachedReports);

      const matchStage: any = {};

      if (!showReviewed) {
        matchStage.actionTaken = "PENDING";
      } else {
        matchStage.actionTaken = { $ne: "PENDING" };
      }

      if (cursor) {
        matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      const foundReports = await Report.aggregate([
        { $match: matchStage },

        { $sort: { _id: -1 } },

        { $limit: limitCount },

        {
          $project: {
            id: "$_id",
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
        reviewedAt: report.reviewedAt
          ? new Date(report.reviewedAt).toISOString()
          : null,
        createdAt: new Date(report.createdAt).toISOString(),
        updatedAt: new Date(report.updatedAt).toISOString(),
        reporter:
          userMap.get(report.reportedBy) ||
          getDeletedUserFallback(report.reportedBy),
        targetUser:
          userMap.get(report.targetUserId) ||
          getDeletedUserFallback(report.targetUserId),
      }));

      const result = {
        reports: reportsWithUsers,
        nextCursor:
          foundReports.length === limitCount
            ? foundReports[foundReports.length - 1].id
            : null,
        hasMore: foundReports.length === limitCount,
      };

      await getRedisCacheClient().set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        60 * 5,
      );

      return result;
    },

    getStrikes: async (
      _: any,
      {
        filter = "ALL",
        cursor,
        limitCount = 10,
        showExpired = false,
      }: {
        filter?: "AI" | "ADMIN" | "ALL";
        cursor?: string;
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

      const cacheKey = `strikes:${filter}:${cursor || "initial"}:${limitCount}`;
      const cachedStrikes = await getRedisCacheClient().get(cacheKey);

      if (cachedStrikes) return JSON.parse(cachedStrikes);

      const where: any = {};

      if (filter === "AI") where.strikedBy = "AI_MODERATION";
      else if (filter === "ADMIN") where.strikedBy = "ADMIN_MODERATION";

      if (!showExpired)
        where.OR = [{ expiresAt: null }, { expiresAt: { gt: Date.now() } }];
      else
        where.expiresAt = { lt: Date.now() }

      const foundStrikes = await prisma.moderationStrike.findMany({
        take: limitCount,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        where,
        orderBy: { id: "desc" },
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
        targetUser: userMap.get(s.userId) || getDeletedUserFallback(s.userId),
        admin: s.adminId
          ? userMap.get(s.adminId) || getDeletedUserFallback(s.adminId)
          : null,
      }));

      const result = {
        strikes: strikesWithUsers,
        nextCursor:
          strikesWithUsers.length === limitCount
            ? strikesWithUsers[strikesWithUsers.length - 1].id
            : null,
        hasMore: strikesWithUsers.length === limitCount,
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
