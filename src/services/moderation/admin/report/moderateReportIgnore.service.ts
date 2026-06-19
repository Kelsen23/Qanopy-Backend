import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

import type { ReportModerationContext } from "./shared.js";

const moderateReportIgnore = async (
  title: string,
  reasons: string[] | undefined,
  context: ReportModerationContext,
  helpers: {
    updateReportStatus: (
      status: "RESOLVED" | "DISMISSED",
      actionTaken: "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE",
      meta: Record<string, unknown>,
    ) => Promise<void>;
    applyContentModerationStatus: () => Promise<void>;
  },
) => {
  const meta = { title, reasons };

  await helpers.applyContentModerationStatus();
  await helpers.updateReportStatus("DISMISSED", "IGNORE", meta);

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "IGNORE",
        { userId: context.reportTargetUserId },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "IGNORE"),
        },
      );
    },
    {
      reportId: context.reportId,
      reportMongoId: context.reportMongoId,
      reviewedBy: context.reviewedBy,
      claimToken: context.claimToken,
      decisionId: context.decisionId,
    },
  );
};

export default moderateReportIgnore;
