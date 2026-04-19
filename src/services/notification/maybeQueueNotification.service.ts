import NotificationParams, {
  NotificationEvent,
  SystemEvent,
} from "../../types/notification.type.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import queueNotification from "../../utils/queueNotification.util.js";

import shouldNotify from "./notification.rules.js";

const SYSTEM_EVENTS = new Set([
  "AI_ANSWER_READY",
  "AI_SUGGESTION_READY",
  "REPORT_UPDATE",
  "REMOVE_CONTENT",
]);

const isSystemEvent = (event: NotificationEvent): event is SystemEvent =>
  SYSTEM_EVENTS.has(event as SystemEvent);

const maybeQueueNotification = async ({
  recipientId,
  actorId,
  event,
  target,
  meta,
}: NotificationParams) => {
  if (!isSystemEvent(event)) {
    const res = await shouldNotify({ recipientId, actorId, event });

    if (!res) return;
  }

  const key = `notify:${recipientId}:${event}:${target.entityType}:${target.entityId}:${actorId ?? "system"}`;

  const exists = await getRedisCacheClient().get(key);

  if (exists) return;

  await getRedisCacheClient().set(key, "1", "EX", 30);

  await queueNotification({ recipientId, actorId, event, target, meta });
};

export default maybeQueueNotification;
