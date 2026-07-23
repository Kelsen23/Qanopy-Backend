import { getUserSockets } from "../../redis/presence.service.js";

import prisma from "../../../config/prisma.config.js";

import { clearNotificationCache } from "../../../utils/cache/clearCache.util.js";
import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Notification from "../../../models/notification.model.js";

const processNotificationJob = async (jobData: {
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
}) => {
  const { recipientId, actorId, event, target, meta } = jobData;
  const normalizedMeta = meta ?? {};

  const notification = (await Notification.create({
    recipientId,
    actorId,
    event: event as any,
    target: target as any,
    meta: normalizedMeta,
  })) as unknown as {
    _id: string;
    createdAt: Date;
    updatedAt: Date;
  };

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
