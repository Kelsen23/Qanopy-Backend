import { Redis } from "ioredis";

import {
  type ModerationGraphqlStrikeContext,
  type StrikeCursor,
  type StrikePage,
} from "../helpers/moderation.strikes.helper.js";
import getStrikes from "../helpers/moderation.strikes.helper.js";

const moderationStrikesResolver = {
  Query: {
    strikes: async (
      _: any,
      {
        filter = "ALL",
        cursor,
        limitCount = 10,
      }: {
        filter?: "AI" | "ADMIN" | "ALL";
        cursor?: StrikeCursor;
        limitCount: number;
      },
      {
        user,
        loaders,
        prisma,
        getRedisCacheClient,
      }: {
        user: ModerationGraphqlStrikeContext["user"];
        loaders: ModerationGraphqlStrikeContext["loaders"];
        prisma: ModerationGraphqlStrikeContext["prisma"];
        getRedisCacheClient: () => Redis;
      },
    ): Promise<StrikePage> => {
      return getStrikes({
        filter,
        cursor,
        limitCount,
        user,
        loaders,
        prisma,
        getRedisCacheClient,
      });
    },
  },
};

export default moderationStrikesResolver;
