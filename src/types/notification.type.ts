type NotificationEvent =
  | "UPVOTE"
  | "DOWNVOTE"
  | "ANSWER_CREATED"
  | "REPLY_CREATED"
  | "AI_SUGGESTION_UNLOCKED"
  | "AI_ANSWER_UNLOCKED"
  | "SIMILAR_QUESTIONS_READY"
  | "AI_SUGGESTION_READY"
  | "AI_ANSWER_READY"
  | "WARN"
  | "STRIKE"
  | "REPORT_UPDATE"
  | "REMOVE_CONTENT";

type SystemEvent =
  | "AI_ANSWER_READY"
  | "AI_SUGGESTION_READY"
  | "REPORT_UPDATE"
  | "REMOVE_CONTENT"
  | "WARN"
  | "STRIKE";

type UserEvent = Exclude<NotificationEvent, SystemEvent>;

type UserNotificationParams = Omit<NotificationParams, "event"> & {
  event: UserEvent;
};

interface NotificationTarget {
  entityType: "QUESTION" | "ANSWER" | "REPLY";
  entityId: string;
  parentId?: string;
  questionVersion?: number;
}

interface NotificationParams {
  recipientId: string;
  actorId: string;
  event: UserEvent | SystemEvent;
  target: NotificationTarget;
  meta: Record<string, unknown>;
}

export default NotificationParams;
export {
  NotificationEvent,
  UserEvent,
  SystemEvent,
  UserNotificationParams,
  NotificationTarget,
};
