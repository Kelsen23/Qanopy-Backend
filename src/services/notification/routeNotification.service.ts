import NotificationParams, {
  SystemEvent,
  UserNotificationParams,
} from "../../types/notification.type.js";

import queueNotification from "../../utils/queueNotification.util.js";

import maybeQueueNotification from "./maybeQueueNotification.service.js";

const SYSTEM_EVENTS = new Set([
  "AI_ANSWER_READY",
  "AI_SUGGESTION_READY",
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
