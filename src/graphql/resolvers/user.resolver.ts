import { Redis } from "ioredis";

import { GraphQLScalarType, Kind } from "graphql";

import mongoose from "mongoose";

import Notification from "../../models/notification.model.js";

import { User } from "../../generated/prisma/client.js";

import HttpError from "../../utils/httpError.util.js";
import sanitizeUser from "../../utils/sanitizeUser.util.js";

const parseJsonLiteral = (ast: any): any => {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const value: Record<string, any> = {};
      for (const field of ast.fields) {
        value[field.name.value] = parseJsonLiteral(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
};

const jsonScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: parseJsonLiteral,
});

const userResolver = {
  JSON: jsonScalar,
  Query: {
    user: async (
      _: any,
      { id }: { id: string },
      {
        prisma,
        getRedisCacheClient,
      }: { prisma: any; getRedisCacheClient: () => Redis },
    ) => {
      const cachedUser = await getRedisCacheClient().get(`user:${id}`);

      if (cachedUser) return JSON.parse(cachedUser);

      const foundUser = await prisma.user.findUnique({ where: { id } });
      if (!foundUser) throw new HttpError("User not found", 404);

      await getRedisCacheClient().set(
        `user:${id}`,
        JSON.stringify(sanitizeUser(foundUser)),
        "EX",
        60 * 20,
      );

      return sanitizeUser(foundUser);
    },

    notifications: async (
      _: any,
      {
        cursor,
        limitCount = 10,
      }: {
        cursor?: { id: string; createdAt: string };
        limitCount: number;
      },
      {
        user,
        getRedisCacheClient,
        loaders,
      }: {
        user: User;
        getRedisCacheClient: () => Redis;
        loaders: any;
      },
    ) => {
      const userId = user.id;

      const normalizedLimitCount =
        Number.isInteger(limitCount) && Number(limitCount) > 0
          ? Number(limitCount)
          : 10;

      const cursorCacheKey = cursor
        ? `${cursor.id}:${cursor.createdAt}`
        : "initial";

      const cachedNotifications = await getRedisCacheClient().get(
        `notifications:${userId}:${cursorCacheKey}:${normalizedLimitCount}`,
      );
      if (cachedNotifications) return JSON.parse(cachedNotifications);

      const matchStage: any = {
        recipientId: userId,
      };

      if (cursor) {
        if (
          !mongoose.isValidObjectId(cursor.id) ||
          isNaN(Date.parse(cursor.createdAt))
        )
          throw new HttpError("Invalid cursor", 400);

        const cursorObjectId = new mongoose.Types.ObjectId(cursor.id);
        const cursorDate = new Date(cursor.createdAt);

        matchStage.$or = [
          { createdAt: { $lt: cursorDate } },
          {
            createdAt: cursorDate,
            _id: { $lt: cursorObjectId },
          },
        ];
      }

      const pipeline: any[] = [
        { $match: matchStage },

        {
          $sort: {
            createdAt: -1,
            _id: -1,
          } as any,
        },

        { $limit: normalizedLimitCount + 1 },

        {
          $project: {
            id: "$_id",
            _id: 0,
            recipientId: 1,
            actorId: 1,
            event: 1,
            target: 1,
            meta: 1,
            seen: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ];

      const notifications = await Notification.aggregate(pipeline);

      const hasMore = notifications.length > normalizedLimitCount;

      const slicedNotifications = hasMore
        ? notifications.slice(0, normalizedLimitCount)
        : notifications;

      const lastNotification =
        slicedNotifications.length > 0
          ? slicedNotifications[slicedNotifications.length - 1]
          : null;

      const unreadCount = await Notification.countDocuments({
        recipientId: userId,
        seen: false,
      });

      const uniqueActorIds = [
        ...new Set(
          slicedNotifications
            .map((n) => n.actorId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];

      const actors = await loaders.userLoader.loadMany(uniqueActorIds);

      const actorMap = new Map(
        actors
          .filter((a: any) => a && !(a instanceof Error))
          .map((a: any) => [a.id, a]),
      );

      const notificationsWithActors = slicedNotifications.map((n) => {
        const actor = n.actorId ? (actorMap.get(n.actorId) ?? null) : null;
        return { ...n, actor };
      });

      const result = {
        notifications: notificationsWithActors,
        nextCursor:
          hasMore && lastNotification
            ? {
                id: lastNotification.id,
                createdAt: lastNotification.createdAt,
              }
            : null,
        hasMore,
        unreadCount,
      };

      await getRedisCacheClient().set(
        `notifications:${userId}:${cursorCacheKey}:${normalizedLimitCount}`,
        JSON.stringify(result),
        "EX",
        60 * 2,
      );

      return result;
    },
  },
};

export default userResolver;
