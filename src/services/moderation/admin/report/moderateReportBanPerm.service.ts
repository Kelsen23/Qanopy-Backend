import { makeJobId } from "../../../../utils/makeJobId.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

import publishSocketDisconnect from "../../../../utils/publishSocketDisconnect.util.js";

import type { ReportModerationContext } from "./shared.js";

const moderateReportBanPerm = async (
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
    queueDeleteContentIfNeeded: (meta: Record<string, unknown>) => Promise<void>;
  },
) => {
  await prisma.$transaction(async (tx) => {
    await tx.ban.create({
      data: {
        userId: context.reportTargetUserId,
        title,
        reasons,
        banType: "PERM",
        bannedBy: "ADMIN_MODERATION",
      },
    });

    await tx.user.update({
      where: { id: context.reportTargetUserId },
      data: { status: "TERMINATED" },
    });
  });

  const meta = {
    reportId: context.reportId,
    targetContentId: context.reportContentId,
    targetContentType: context.targetType,
    action: "BAN_PERM",
    title,
    reasons,
  };

  await helpers.updateReportStatus("RESOLVED", "BAN_PERM", meta);
  await helpers.applyContentModerationStatus();
  await helpers.queueDeleteContentIfNeeded(meta);

  await moderationMetricsQueue.add(
    "BAN_PERM",
    { userId: context.reportTargetUserId },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", context.decisionId, "BAN_PERM"),
    },
  );

  await publishSocketDisconnect(context.reportTargetUserId);
};

export default moderateReportBanPerm;
