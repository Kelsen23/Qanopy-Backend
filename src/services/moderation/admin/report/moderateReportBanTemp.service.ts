import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";

import publishSocketDisconnect from "../../../../utils/socket/publishSocketDisconnect.util.js";
import clearUserCache from "../../../../utils/cache/clearUserCache.util.js";

import sendBanNoticeEmail from "../../sendBanNoticeEmail.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

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
    queueDeleteContentIfNeeded: (
      meta: Record<string, unknown>,
    ) => Promise<void>;
  },
) => {
  const expiresAt = new Date(Date.now() + banDurationMs);

  if (context.targetUserExists) {
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

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "BAN_TEMP",
        { userId: context.reportTargetUserId },
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

  await sendBanNoticeEmail({
    userId: context.reportTargetUserId,
    decisionId: context.decisionId,
    actionTaken: "BAN_TEMP",
    reasons,
    banDurationMs,
  });
};

export default moderateReportBanTemp;
