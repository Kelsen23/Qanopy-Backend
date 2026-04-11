import notificationQueue from "../queues/notification.queue.js";

import { makeJobId } from "./makeJobId.util.js";

type NotificationType =
  | "WARN"
  | "STRIKE"
  | "REPORT_UPDATE"
  | "REMOVE_CONTENT"
  | "UPVOTE"
  | "ANSWER"
  | "MENTION"
  | "REPLY"
  | "AI_SUGGESTION"
  | "AI_ANSWER";

const queueNotification = async ({
  userId,
  type,
  referenceId,
  meta,
}: {
  userId: string;
  type: NotificationType;
  referenceId: string;
  meta: Record<string, unknown>;
}) => {
  await notificationQueue.add(
    "CREATE_NOTIFICATION",
    {
      userId,
      type,
      referenceId,
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("notification", userId, type, referenceId),
    },
  );
};

export default queueNotification;
