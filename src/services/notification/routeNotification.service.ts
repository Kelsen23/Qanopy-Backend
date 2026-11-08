import NotificationParams, {
  SystemEvent,
  UserNotificationParams,
} from "../../types/notification.type.js";

import maybeQueueNotification from "./maybeQueueNotification.service.js";

import queueNotification from "../../utils/notification/queueNotification.util.js";

const SYSTEM_EVENTS = new Set([
  "AI_ANSWER_READY",
  "AI_ANSWER_PAYMENT_BLOCKED",
  "AI_SUGGESTION_READY",
  "QUESTION_ELIGIBILITY_UPDATE",
  "REPORT_UPDATE",
  "REMOVE_CONTENT",
  "WARN",
  "STRIKE",
]);

const routeNotification = async (params: NotificationParams) => {
  const { event } = params;

  if (SYSTEM_EVENTS.has(event as SystemEvent)) {
    return queueNotification(params);
  }

  return maybeQueueNotification(params as UserNotificationParams);
};

export { SYSTEM_EVENTS };
export default routeNotification;
