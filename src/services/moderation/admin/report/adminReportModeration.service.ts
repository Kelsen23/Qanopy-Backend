import crypto from "crypto";

import HttpError from "../../../../utils/http/httpError.util.js";
import { clearReportsCache } from "../../../../utils/cache/clearCache.util.js";

import Report from "../../../../models/report.model.js";

import prisma from "../../../../config/prisma.config.js";

import type { AdminReportActionTaken } from "../shared.js";
import type { ReportModerationContext } from "./shared.js";

import assertAdminModerationTargetReady from "../assertAdminModerationTargetReady.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";
import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";
import finalizeReportReview from "./finalizeReportReview.service.js";
import resolveReportStatus from "./resolveReportStatus.service.js";
import queueReportContentRemoval from "./queueReportContentRemoval.service.js";
import applyAdminReportModerationDecision from "./applyAdminReportModerationDecision.service.js";
import moderateReportBanTemp from "./moderateReportBanTemp.service.js";
import moderateReportBanPerm from "./moderateReportBanPerm.service.js";
import moderateReportWarn from "./moderateReportWarn.service.js";
import moderateReportIgnore from "./moderateReportIgnore.service.js";

const adminModerateReport = async ({
  targetId,
  reviewedBy,
  reviewComment,
  actionTaken,
  title,
  reasons,
  banDurationMs,
  warningDurationMs,
}: {
  targetId: string;
  reviewedBy: string;
  reviewComment?: string;
  actionTaken: AdminReportActionTaken;
  title: string;
  reasons: string[];
  banDurationMs?: number;
  warningDurationMs?: number;
}) => {
  const foundReport = await Report.findOne({
    _id: targetId,
    status: "PENDING",
  });

  if (!foundReport) {
    throw new HttpError("Report not found", 404);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: foundReport.targetUserId as string },
    select: { id: true },
  });

  const targetUserExists = Boolean(targetUser);

  if (targetUser?.id === reviewedBy) {
    throw new HttpError("Self-moderation not allowed", 403);
  }

  const resolvedAt = new Date();
  const reportTargetUserId = foundReport.targetUserId as string;
  const reportContentId = String(foundReport.targetId);
  const reportContentVersion =
    typeof foundReport.targetContentVersion === "number"
      ? foundReport.targetContentVersion
      : null;
  const shouldRemoveContent =
    actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP";
  const decisionId = crypto.randomUUID();
  const reportId = String(foundReport.id);
  const reporterUserId = foundReport.reportedBy as string;
  const reportMongoId = String(foundReport._id);
  const claimToken = crypto.randomUUID();
  const targetType =
    foundReport.targetType as ReportModerationContext["targetType"];

  await assertAdminModerationTargetReady({
    targetType,
    targetId: reportContentId,
    targetContentVersion: reportContentVersion,
  });

  const claimReport = await Report.findOneAndUpdate(
    {
      _id: foundReport._id,
      status: "PENDING",
      $or: [{ reviewedBy: null }, { claimExpiresAt: { $lte: resolvedAt } }],
    },
    {
      reviewedBy,
      reviewComment,
      reviewedAt: resolvedAt,
      claimedAt: resolvedAt,
      claimExpiresAt: new Date(resolvedAt.getTime() + 24 * 60 * 60 * 1000),
      claimToken,
    },
    { returnDocument: "after" },
  );

  if (!claimReport) {
    throw new HttpError("Report already resolved", 409);
  }

  await runSideEffectWithRetry(
    "clearReportsCache",
    async () => {
      await clearReportsCache();
    },
    {
      reportMongoId,
      reviewedBy,
      claimToken,
      actionTaken,
      targetType,
    },
  );

  await assertReportClaimIsCurrent({
    reportMongoId,
    reviewedBy,
    claimToken,
  });

  const context: ReportModerationContext = {
    reportId,
    reportMongoId,
    reportTargetUserId,
    targetUserExists,
    reportContentId,
    reportContentVersion,
    targetType,
    reviewedBy,
    claimToken,
    decisionId,
    reporterUserId,
  };

  const updateReportStatus = async (
    status: "RESOLVED" | "DISMISSED",
    actionTakenValue: AdminReportActionTaken,
    meta: Record<string, unknown>,
  ) => {
    await resolveReportStatus(status, actionTakenValue, meta, {
      reportMongoId,
      reviewedBy,
      claimToken,
      decisionId,
      reportId,
      reportTargetUserId,
      reportContentId,
      reportContentVersion,
      targetType,
      reporterUserId,
      shouldRemoveContent,
    });
  };

  const queueDeleteContentIfNeeded = async (meta: Record<string, unknown>) => {
    if (!shouldRemoveContent) return;

    await queueReportContentRemoval(meta, {
      reportMongoId,
      reportId,
      reportTargetUserId,
      reportContentId,
      reportContentVersion,
      targetType,
      reviewedBy,
      claimToken,
      decisionId,
      actionTaken,
    });
  };

  const applyContentModerationStatus = async () => {
    await applyAdminReportModerationDecision({
      reportMongoId,
      reportContentId,
      reportContentVersion,
      targetType,
      actionTaken,
      reviewedBy,
      decisionId,
      reportId,
      claimToken,
    });
  };

  try {
    switch (actionTaken) {
      case "BAN_TEMP":
        await moderateReportBanTemp(
          title,
          reasons,
          banDurationMs as number,
          context,
          {
            updateReportStatus,
            applyContentModerationStatus,
            queueDeleteContentIfNeeded,
          },
        );
        break;

      case "BAN_PERM":
        await moderateReportBanPerm(title, reasons, context, {
          updateReportStatus,
          applyContentModerationStatus,
          queueDeleteContentIfNeeded,
        });
        break;

      case "WARN":
        await moderateReportWarn(
          title,
          reasons,
          warningDurationMs as number,
          context,
          {
            updateReportStatus,
            applyContentModerationStatus,
            queueDeleteContentIfNeeded,
          },
        );
        break;

      case "IGNORE":
        await moderateReportIgnore(title, reasons, context, {
          updateReportStatus,
          applyContentModerationStatus,
        });
        break;
    }

    await finalizeReportReview({
      reportMongoId,
      reviewedBy,
      claimToken,
    });

    await runSideEffectWithRetry(
      "clearReportsCache",
      async () => {
        await clearReportsCache();
      },
      {
        reportMongoId,
        reviewedBy,
        claimToken,
        actionTaken,
        targetType,
        phase: "success",
      },
    );
  } catch (error) {
    await Report.findOneAndUpdate(
      {
        _id: foundReport._id,
        status: "PENDING",
        reviewedBy,
        claimToken,
      },
      {
        reviewedBy: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
        reviewedAt: null,
        $unset: { reviewComment: 1 },
      },
      { returnDocument: "after" },
    );

    await runSideEffectWithRetry(
      "clearReportsCache",
      async () => {
        await clearReportsCache();
      },
      {
        reportMongoId,
        reviewedBy,
        claimToken,
        actionTaken,
        targetType,
        phase: "rollback",
      },
    );

    throw error;
  }
};

export default adminModerateReport;
