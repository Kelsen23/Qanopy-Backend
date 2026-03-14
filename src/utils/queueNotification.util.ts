import notificationQueue from "../queues/notification.queue.js";

type NotificationType =
  | "WARN"
  | "STRIKE"
  | "REPORT_UPDATE"
  | "REMOVE_CONTENT"
  | "UPVOTE"
  | "ANSWER"
  | "MENTION"
  | "REPLY"
  | "AI_SUGGESTION";

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
  await notificationQueue.add("createNotification", {
    userId,
    type,
    referenceId,
    meta,
  });
};

export default queueNotification;
