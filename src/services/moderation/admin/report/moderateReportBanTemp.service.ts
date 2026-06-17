import HttpError from "../../../../utils/httpError.util.js";
import { makeJobId } from "../../../../utils/makeJobId.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

import publishSocketDisconnect from "../../../../utils/publishSocketDisconnect.util.js";

import type { ReportModerationContext } from "./shared.js";

const moderateReportBanTemp = async (
  title: string,
  reasons: string[],
  banDurationMs: number,
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
  const expiresAt = new Date(Date.now() + banDurationMs);

  await prisma.$transaction(async (tx) => {
    const existingPermBan = await tx.ban.findFirst({
      where: { userId: context.reportTargetUserId, banType: "PERM" },
    });

    if (existingPermBan) {
      throw new HttpError("User already has a permanent ban", 409);
    }

    const existingTempBan = await tx.ban.findFirst({
      where: {
        userId: context.reportTargetUserId,
        banType: "TEMP",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingTempBan) {
      throw new HttpError("User already has an active temp ban", 409);
    }

    await tx.ban.create({
      data: {
        userId: context.reportTargetUserId,
        title,
        reasons,
        banType: "TEMP",
        bannedBy: "ADMIN_MODERATION",
        expiresAt,
        durationMs: banDurationMs,
      },
    });

    await tx.user.update({
      where: { id: context.reportTargetUserId },
      data: { status: "SUSPENDED" },
    });
  });

  const meta = {
    reportId: context.reportId,
    targetContentId: context.reportContentId,
    targetContentType: context.targetType,
    action: "BAN_TEMP",
    title,
    reasons,
    expiresAt,
    durationMs: banDurationMs,
  };

  await helpers.updateReportStatus("RESOLVED", "BAN_TEMP", meta);
  await helpers.applyContentModerationStatus();
  await helpers.queueDeleteContentIfNeeded(meta);

  await moderationMetricsQueue.add(
    "BAN_TEMP",
    { userId: context.reportTargetUserId },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", context.decisionId, "BAN_TEMP"),
    },
  );

  await publishSocketDisconnect(context.reportTargetUserId);
};

export default moderateReportBanTemp;
