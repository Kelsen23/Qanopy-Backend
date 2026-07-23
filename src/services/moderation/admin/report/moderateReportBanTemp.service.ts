import type { Prisma } from "../../../../generated/prisma/client.js";

import type { ReportModerationContext } from "./shared.js";

import applyUserBan from "../../applyUserBan.service.js";
import sendBanNoticeEmail from "../../sendBanNoticeEmail.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

import prisma from "../../../../config/prisma.config.js";

import clearUserCache from "../../../../utils/cache/clearUserCache.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";
import publishSocketDisconnect from "../../../../utils/socket/publishSocketDisconnect.util.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

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
    queueDeleteContentIfNeeded: (
      meta: Record<string, unknown>,
    ) => Promise<void>;
  },
) => {
  const expiresAt = new Date(Date.now() + banDurationMs);
  let createdBan = false;

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

  await helpers.applyContentModerationStatus();
  await helpers.queueDeleteContentIfNeeded(meta);

  if (context.targetUserExists) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await applyUserBan(tx, {
        userId: context.reportTargetUserId,
        banType: "TEMP",
        title,
        reasons,
        bannedBy: "ADMIN_MODERATION",
        durationMs: banDurationMs,
      });

      createdBan = result.createdBan;
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
        actionTaken: "BAN_TEMP",
      },
    );
  }

  await helpers.updateReportStatus("RESOLVED", "BAN_TEMP", meta);

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "BAN_TEMP",
        {
          userId: context.reportTargetUserId,
          reviewedBy: "ADMIN_MODERATION",
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "BAN_TEMP"),
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

  if (createdBan) {
    await sendBanNoticeEmail({
      userId: context.reportTargetUserId,
      decisionId: context.decisionId,
      actionTaken: "BAN_TEMP",
      reasons,
      banDurationMs,
    });
  }
};

export default moderateReportBanTemp;
