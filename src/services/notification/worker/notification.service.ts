import { getUserSockets } from "../../redis/presence.service.js";

import prisma from "../../../config/prisma.config.js";

import { clearNotificationCache } from "../../../utils/cache/clearCache.util.js";
import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Notification from "../../../models/notification.model.js";

type NotificationJobData = {
  recipientId: string;
  actorId?: string;
  event: string;
  target: {
    entityType?:
      | "USER"
      | "QUESTION"
      | "ANSWER"
      | "REPLY"
      | "AI_ANSWER_FEEDBACK"
      | "REPORT";
    entityId?: string;
    parentId?: string | null;
    questionVersion?: number | null;
  };
  meta?: Record<string, unknown>;
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;

const isAiSuggestionReadyNotification = ({
  event,
  target,
}: Pick<NotificationJobData, "event" | "target">) =>
  event === "AI_SUGGESTION_READY" &&
  target.entityType === "QUESTION" &&
  Boolean(target.entityId) &&
  typeof target.questionVersion === "number";

const findAiSuggestionReadyNotification = ({
  recipientId,
  event,
  target,
}: Pick<NotificationJobData, "recipientId" | "event" | "target">) =>
  Notification.findOne({
    recipientId,
    event,
    "target.entityType": target.entityType,
    "target.entityId": target.entityId,
    "target.questionVersion": target.questionVersion,
  } as any);

const findByIdempotencyKey = (idempotencyKey: string) =>
  Notification.findOne({ "meta.idempotencyKey": idempotencyKey });

const createNotification = async ({
  recipientId,
  actorId,
  event,
  target,
  meta,
}: NotificationJobData) => {
  try {
    const notification = await Notification.create({
      recipientId,
      actorId,
      event: event as any,
      target: target as any,
      meta,
    });

    return { notification, created: true };
  } catch (error) {
    if (
      isDuplicateKeyError(error) &&
      isAiSuggestionReadyNotification({ event, target })
    ) {
      const existingNotification = await findAiSuggestionReadyNotification({
        recipientId,
        event,
        target,
      });

      if (existingNotification) {
        return { notification: existingNotification, created: false };
      }
    }

    if (
      isDuplicateKeyError(error) &&
      event === "AI_ANSWER_PAYMENT_BLOCKED" &&
      typeof meta?.idempotencyKey === "string"
    ) {
      const existingNotification = await findByIdempotencyKey(
        meta.idempotencyKey,
      );
      if (existingNotification)
        return { notification: existingNotification, created: false };
    }

    throw error;
  }
};

const processNotificationJob = async (jobData: NotificationJobData) => {
  const { recipientId, actorId, event, target, meta } = jobData;
  const normalizedMeta = meta ?? {};

  const { notification, created } = await createNotification({
    recipientId,
    actorId,
    event,
    target,
    meta: normalizedMeta,
  });

  if (!created) {
    await clearNotificationCache(recipientId);
    return;
  }

  const sockets = await getUserSockets(recipientId);

  let actor = null;

  if (sockets.length > 0) {
    if (actorId) {
      actor = await prisma.user
        .findUnique({
          where: { id: actorId },
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                displayName: true,
                profilePictureKey: true,
                profilePictureUrl: true,
              },
            },
            statusState: {
              select: {
                isDeleted: true,
              },
            },
          },
        })
        .then((user) =>
          user
            ? {
                id: user.id,
                username: user.username,
                displayName: user.profile?.displayName ?? null,
                profilePictureKey: user.profile?.profilePictureKey ?? null,
                profilePictureUrl: user.profile?.profilePictureUrl ?? null,
                isDeleted: user.statusState?.isDeleted ?? false,
              }
            : null,
        );
    }

    await publishSocketEvent(recipientId, "notification", {
      id: notification._id,
      actorId,
      actor,
      event,
      target,
      meta: normalizedMeta,
      seen: false,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    });
  }

  await clearNotificationCache(recipientId);
};

export default processNotificationJob;
