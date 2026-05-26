import { Redis } from "ioredis";

import { User } from "../../../generated/prisma/client.js";

import { getUserNotifications } from "./user.notifications.helper.js";

const userNotificationsResolver = {
  Query: {
    notifications: async (
      _: any,
      {
        cursor,
        limitCount = 10,
      }: {
        cursor?: { id: string; createdAt: string };
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
    ) => {
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
