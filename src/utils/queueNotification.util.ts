import notificationQueue from "../queues/notification.queue.js";
import NotificationParams from "../types/notification.type.js";

import { makeJobId } from "./makeJobId.util.js";

const queueNotification = async ({
  recipientId,
  actorId,
  event,
  target,
  meta,
}: NotificationParams) => {
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
      ),
    },
  );
};

export default queueNotification;
