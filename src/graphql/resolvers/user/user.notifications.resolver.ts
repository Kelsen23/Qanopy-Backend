import { Redis } from "ioredis";

import { User } from "../../../generated/prisma/index.js";

import {
  type NotificationCursor,
  type NotificationPage,
  getUserNotifications,
} from "./user.notifications.helper.js";

const userNotificationsResolver = {
  Query: {
    notifications: async (
      _: any,
      {
        cursor,
        limitCount = 10,
      }: {
        cursor?: NotificationCursor;
        limitCount: number;
      },
      {
        user,
        getRedisCacheClient,
        loaders,
      }: {
        user: User;
        getRedisCacheClient: () => Redis;
        loaders: any;
      },
    ): Promise<NotificationPage> => {
      return getUserNotifications({
        userId: user.id,
        cursor,
        limitCount,
        getRedisCacheClient,
        loaders,
      });
    },
  },
};

export default userNotificationsResolver;
