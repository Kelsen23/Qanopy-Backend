import mongoose from "mongoose";

import { clearNotificationCache } from "../../utils/clearCache.util.js";

import Notification from "../../models/notification.model.js";

interface MarkNotificationsAsSeenInput {
  userId: string;
  notificationIds: string[];
}

const markNotificationsAsSeen = async ({
  userId,
  notificationIds,
}: MarkNotificationsAsSeenInput) => {
  const validIds = notificationIds.filter((id) => mongoose.isValidObjectId(id));

  if (validIds.length === 0) {
    return { message: "No valid notification ids" };
  }

  await Notification.updateMany(
    {
      recipientId: userId,
      _id: { $in: validIds },
      seen: false,
    },
    { $set: { seen: true } },
  );

  await clearNotificationCache(userId);

  return { message: "Notifications marked as seen" };
};

export default markNotificationsAsSeen;
