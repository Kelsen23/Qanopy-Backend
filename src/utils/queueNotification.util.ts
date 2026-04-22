import notificationQueue from "../queues/notification.queue.js";
import NotificationParams from "../types/notification.type.js";

import { makeJobId } from "./makeJobId.util.js";

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nestedValue]) => `"${key}":${stableStringify(nestedValue)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
};

const makeNotificationDiscriminator = (
  target: NotificationParams["target"],
  meta: NotificationParams["meta"],
) =>
  stableStringify({
    parentId: target.parentId ?? null,
    questionVersion: target.questionVersion ?? null,
    meta,
  });

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
        makeNotificationDiscriminator(target, meta),
      ),
    },
  );
};

export default queueNotification;
