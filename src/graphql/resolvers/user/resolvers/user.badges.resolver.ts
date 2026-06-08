import { Redis } from "ioredis";

import { User } from "../../../../generated/prisma/index.js";

import {
  type UserBadgeCursor,
  type UserBadgePage,
  getUserBadges,
} from "../helpers/user.badges.helper.js";

const userBadgesResolver = {
  Query: {
    badges: async (
      _: any,
      {
        cursor,
        limitCount = 5,
      }: {
        cursor?: UserBadgeCursor;
        limitCount: number;
      },
      {
        user,
        prisma,
        getRedisCacheClient,
      }: {
        user: User;
        prisma: any;
        getRedisCacheClient: () => Redis;
      },
    ): Promise<UserBadgePage> => {
      return getUserBadges({
        userId: user.id,
        cursor,
        limitCount,
        prisma,
        getRedisCacheClient,
      });
    },
  },
};

export default userBadgesResolver;
