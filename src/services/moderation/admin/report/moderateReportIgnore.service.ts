import { makeJobId } from "../../../../utils/makeJobId.util.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

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

  await helpers.updateReportStatus("DISMISSED", "IGNORE", meta);
  await helpers.applyContentModerationStatus();

  await moderationMetricsQueue.add(
    "IGNORE",
    { userId: context.reportTargetUserId },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", context.decisionId, "IGNORE"),
    },
  );
};

export default moderateReportIgnore;
