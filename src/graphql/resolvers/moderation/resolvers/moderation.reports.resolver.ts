import { Redis } from "ioredis";

import {
  type ModerationGraphqlContext,
  type ReportCursor,
  type ReportPage,
} from "../helpers/moderation.reports.helper.js";
import getReports from "../helpers/moderation.reports.helper.js";

const moderationReportsResolver = {
  Query: {
    reports: async (
      _: any,
      {
        cursor,
        limitCount = 10,
        showReviewed = false,
      }: {
        cursor?: ReportCursor;
        limitCount: number;
        showReviewed: boolean;
      },
      {
        user,
        loaders,
        getRedisCacheClient,
      }: {
        user: ModerationGraphqlContext["user"];
        loaders: ModerationGraphqlContext["loaders"];
        getRedisCacheClient: () => Redis;
      },
    ): Promise<ReportPage> => {
      return getReports({
        cursor,
        limitCount,
        showReviewed,
        user,
        loaders,
        getRedisCacheClient,
      });
    },
  },
};

export default moderationReportsResolver;
