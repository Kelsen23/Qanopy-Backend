import NotificationParams from "../../types/notification.type.js";

import { makeJobId } from "../job/makeJobId.util.js";

import notificationQueue from "../../queues/notification/notification.queue.js";

const queueNotification = async ({
  recipientId,
  actorId,
  event,
  target,
  meta,
}: NotificationParams) => {
  const idempotencyKey = meta.idempotencyKey;

  await notificationQueue.add(
    "CREATE_NOTIFICATION",
    {
      recipientId,
      actorId: actorId ?? null,
      event,
      target,
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "notification",
        recipientId,
        actorId ?? "system",
        event,
        target.entityType,
        target.entityId,
        target.parentId ?? "root",
        target.questionVersion ?? "latest",
        typeof idempotencyKey === "string" ? idempotencyKey : "standard",
      ),
    },
  );
};

export default queueNotification;
