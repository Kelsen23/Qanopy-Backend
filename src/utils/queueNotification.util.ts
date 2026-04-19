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
      actorId,
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
        event,
        target.entityType,
        target.entityId,
        target.questionVersion ?? "none",
      ),
    },
  );
};

export default queueNotification;
