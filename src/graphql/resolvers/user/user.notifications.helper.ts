import { Redis } from "ioredis";

import mongoose from "mongoose";

import Notification from "../../../models/notification.model.js";

import HttpError from "../../../utils/httpError.util.js";

type NotificationCursor = {
  id: string;
  createdAt: string;
};

type UserNotificationsContext = {
  userId: string;
  cursor?: NotificationCursor;
  limitCount: number;
  getRedisCacheClient: () => Redis;
  loaders: {
    userLoader: {
      loadMany: (keys: readonly string[]) => Promise<unknown[]>;
    };
  };
};

const normalizeLimitCount = (limitCount: number) =>
  Number.isInteger(limitCount) && Number(limitCount) > 0 ? Number(limitCount) : 10;

const buildNotificationsCacheKey = (
  userId: string,
  cursor: NotificationCursor | undefined,
  limitCount: number,
) => {
  const cursorCacheKey = cursor
    ? `${cursor.id}:${cursor.createdAt}`
    : "initial";

  return `notifications:${userId}:${cursorCacheKey}:${limitCount}`;
};

const validateCursor = (cursor: NotificationCursor) => {
  if (
    !mongoose.isValidObjectId(cursor.id) ||
    Number.isNaN(Date.parse(cursor.createdAt))
  ) {
    throw new HttpError("Invalid cursor", 400);
  }
};

const getUserNotifications = async ({
  userId,
  cursor,
  limitCount,
  getRedisCacheClient,
  loaders,
}: UserNotificationsContext) => {
  const normalizedLimitCount = normalizeLimitCount(limitCount);
  const cacheKey = buildNotificationsCacheKey(
    userId,
    cursor,
    normalizedLimitCount,
  );

  const cachedNotifications = await getRedisCacheClient().get(cacheKey);
  if (cachedNotifications) return JSON.parse(cachedNotifications);

  const matchStage = { recipientId: userId } as any;

  if (cursor) {
    validateCursor(cursor);

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
      },
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
        meta: { $ifNull: ["$meta", {}] },
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
        .map((notification) => notification.actorId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const actors = await loaders.userLoader.loadMany(uniqueActorIds);

  const actorMap = new Map(
    actors
      .filter((actor: any) => actor && !(actor instanceof Error))
      .map((actor: any) => [actor.id, actor]),
  );

  const notificationsWithActors = slicedNotifications.map((notification) => {
    const actor = notification.actorId
      ? (actorMap.get(notification.actorId) ?? null)
      : null;

    return { ...notification, actor };
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
    cacheKey,
    JSON.stringify(result),
    "EX",
    60 * 2,
  );

  return result;
};

export {
  type NotificationCursor,
  buildNotificationsCacheKey,
  getUserNotifications,
  normalizeLimitCount,
  validateCursor,
};
