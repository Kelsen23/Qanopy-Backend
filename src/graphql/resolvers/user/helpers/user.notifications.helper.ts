import { Redis } from "ioredis";

import mongoose, { PipelineStage } from "mongoose";

import Notification from "../../../../models/notification.model.js";

import HttpError from "../../../../utils/http/httpError.util.js";

type NotificationCursor = {
  id: string;
  createdAt: string;
};

type NotificationTarget = {
  entityType:
    | "QUESTION"
    | "ANSWER"
    | "REPLY"
    | "AI_ANSWER_FEEDBACK"
    | "REPORT"
    | "USER";
  entityId: string;
  parentId?: string | null;
  questionVersion?: number | null;
};

type NotificationRecord = {
  id: string;
  recipientId: string;
  actorId: string | null;
  event: string;
  target: NotificationTarget;
  meta: Record<string, unknown>;
  seen: boolean;
  createdAt: string;
  updatedAt: string;
};

type NotificationActor = {
  id: string;
  [key: string]: unknown;
};

type NotificationWithActor = NotificationRecord & {
  actor: NotificationActor | null;
};

type CachedNotificationPage = {
  notifications: NotificationRecord[];
  nextCursor: NotificationCursor | null;
  hasMore: boolean;
  unreadCount: number;
};

type NotificationPage = {
  notifications: NotificationWithActor[];
  nextCursor: NotificationCursor | null;
  hasMore: boolean;
  unreadCount: number;
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

type NotificationMatchStage = {
  recipientId: string;
  $or?: Array<
    | { createdAt: { $lt: Date } }
    | { createdAt: Date; _id: { $lt: mongoose.Types.ObjectId } }
  >;
};

const normalizeLimitCount = (limitCount: number) =>
  Number.isInteger(limitCount) && Number(limitCount) > 0
    ? Number(limitCount)
    : 10;

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

const normalizeNotification = (notification: {
  id: unknown;
  recipientId: unknown;
  actorId: unknown;
  event: unknown;
  target: NotificationTarget;
  meta: unknown;
  seen: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}): NotificationRecord => ({
  id: String(notification.id),
  recipientId: String(notification.recipientId),
  actorId:
    notification.actorId === null || notification.actorId === undefined
      ? null
      : String(notification.actorId),
  event: String(notification.event),
  target: notification.target,
  meta:
    notification.meta && typeof notification.meta === "object"
      ? (notification.meta as Record<string, unknown>)
      : {},
  seen: Boolean(notification.seen),
  createdAt: new Date(notification.createdAt as string).toISOString(),
  updatedAt: new Date(notification.updatedAt as string).toISOString(),
});

const parseCachedPage = (cachedNotifications: string): CachedNotificationPage =>
  JSON.parse(cachedNotifications) as CachedNotificationPage;

const buildActorMap = async (
  slicedNotifications: NotificationRecord[],
  loaders: UserNotificationsContext["loaders"],
) => {
  const uniqueActorIds = [
    ...new Set(
      slicedNotifications
        .map((notification) => notification.actorId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const actors = await loaders.userLoader.loadMany(uniqueActorIds);

  return new Map(
    actors
      .filter(
        (actor): actor is NotificationActor =>
          Boolean(actor) &&
          typeof actor === "object" &&
          !Array.isArray(actor) &&
          (() => {
            const candidate = actor as Record<string, unknown>;
            return "id" in candidate && typeof candidate.id === "string";
          })(),
      )
      .map((actor) => [actor.id, actor] as const),
  );
};

const hydrateNotifications = async (
  notifications: NotificationRecord[],
  loaders: UserNotificationsContext["loaders"],
) => {
  const actorMap = await buildActorMap(notifications, loaders);

  return notifications.map<NotificationWithActor>((notification) => {
    const actor = notification.actorId
      ? (actorMap.get(notification.actorId) ?? null)
      : null;

    return {
      ...notification,
      actor,
    };
  });
};

const getUserNotifications = async ({
  userId,
  cursor,
  limitCount,
  getRedisCacheClient,
  loaders,
}: UserNotificationsContext) => {
  const normalizedLimitCount = normalizeLimitCount(limitCount);

  if (cursor) {
    validateCursor(cursor);
  }

  const cacheKey = buildNotificationsCacheKey(
    userId,
    cursor,
    normalizedLimitCount,
  );

  const cachedNotifications = await getRedisCacheClient().get(cacheKey);
  if (cachedNotifications) {
    const cachedPage = parseCachedPage(cachedNotifications);
    const notificationsWithActors = await hydrateNotifications(
      cachedPage.notifications,
      loaders,
    );

    return {
      ...cachedPage,
      notifications: notificationsWithActors,
    } satisfies NotificationPage;
  }

  const matchStage: NotificationMatchStage = {
    recipientId: userId,
  };

  if (cursor) {
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

  const pipeline: PipelineStage[] = [
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

  const notifications = (await Notification.aggregate(pipeline)).map(
    normalizeNotification,
  );

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

  const notificationsWithActors = await hydrateNotifications(
    slicedNotifications,
    loaders,
  );

  const result: CachedNotificationPage = {
    notifications: slicedNotifications,
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

  return {
    ...result,
    notifications: notificationsWithActors,
  } satisfies NotificationPage;
};

export {
  type CachedNotificationPage,
  type NotificationActor,
  type NotificationCursor,
  type NotificationPage,
  type NotificationRecord,
  type NotificationTarget,
  buildNotificationsCacheKey,
  getUserNotifications,
  normalizeLimitCount,
  validateCursor,
};
