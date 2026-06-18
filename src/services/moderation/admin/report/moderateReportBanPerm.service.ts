import { makeJobId } from "../../../../utils/makeJobId.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

import publishSocketDisconnect from "../../../../utils/publishSocketDisconnect.util.js";
import clearUserCache from "../../../../utils/clearUserCache.util.js";

import sendBanNoticeEmail from "../../sendBanNoticeEmail.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

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
    queueDeleteContentIfNeeded: (
      meta: Record<string, unknown>,
    ) => Promise<void>;
  },
) => {
  if (context.targetUserExists) {
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

    await runSideEffectWithRetry(
      "clearUserCache",
      async () => {
        await clearUserCache(context.reportTargetUserId);
      },
      {
        reportId: context.reportId,
        reportMongoId: context.reportMongoId,
        reviewedBy: context.reviewedBy,
        claimToken: context.claimToken,
        decisionId: context.decisionId,
        targetUserId: context.reportTargetUserId,
        actionTaken: "BAN_PERM",
      },
    );
  }

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

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "BAN_PERM",
        { userId: context.reportTargetUserId },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "BAN_PERM"),
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

  if (context.targetUserExists) {
    await runSideEffectWithRetry(
      "redisPub:socket:disconnect",
      async () => {
        await publishSocketDisconnect(context.reportTargetUserId);
      },
      {
        reportId: context.reportId,
        reportMongoId: context.reportMongoId,
        reviewedBy: context.reviewedBy,
        claimToken: context.claimToken,
        decisionId: context.decisionId,
      },
    );
  }

  await sendBanNoticeEmail({
    userId: context.reportTargetUserId,
    decisionId: context.decisionId,
    actionTaken: "BAN_PERM",
    reasons,
  });
};

export default moderateReportBanPerm;
