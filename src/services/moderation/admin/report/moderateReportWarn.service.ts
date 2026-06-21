import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import routeNotification from "../../../notification/routeNotification.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

import type { ReportModerationContext } from "./shared.js";

const moderateReportWarn = async (
  title: string,
  reasons: string[],
  warningDurationMs: number,
  context: ReportModerationContext,
  helpers: {
    updateReportStatus: Function;
    applyContentModerationStatus: () => Promise<void>;
    queueDeleteContentIfNeeded: Function;
  },
) => {
  const expiresAt = new Date(Date.now() + warningDurationMs);

  if (context.targetUserExists) {
    await prisma.warning.create({
      data: {
        userId: context.reportTargetUserId,
        title,
        reasons,
        warnedBy: "ADMIN_MODERATION",
        expiresAt,
      },
    });
  }

  const meta = {
    reportId: context.reportId,
    targetContentId: context.reportContentId,
    targetContentType: context.targetType,
    title,
    reasons,
    expiresAt,
  };

  await helpers.applyContentModerationStatus();
  await helpers.queueDeleteContentIfNeeded(meta);
  await helpers.updateReportStatus("RESOLVED", "WARN", meta);

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "WARN",
        {
          userId: context.reportTargetUserId,
          reviewedBy: "ADMIN_MODERATION",
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "WARN"),
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

  await runSideEffectWithRetry(
    "queueNotification:WARN",
    async () => {
      await routeNotification({
        recipientId: context.reportTargetUserId,
        event: "WARN",
        target: {
          entityType: "USER",
          entityId: context.reportTargetUserId,
        },
        meta: {
          title,
          reasons,
          expiresAt,
          reportId: context.reportId,
        },
      });
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

export default moderateReportWarn;
