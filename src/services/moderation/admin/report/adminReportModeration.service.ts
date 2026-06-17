import crypto from "crypto";

import HttpError from "../../../../utils/httpError.util.js";
import { clearReportsCache } from "../../../../utils/clearCache.util.js";

import Report from "../../../../models/report.model.js";

import prisma from "../../../../config/prisma.config.js";

import type { AdminReportActionTaken, ReportTargetType } from "../shared.js";
import type { ReportModerationContext } from "./shared.js";
import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";
import resolveReportStatus from "./resolveReportStatus.service.js";
import queueReportContentRemoval from "./queueReportContentRemoval.service.js";
import applyAdminReportModerationDecision from "./applyAdminReportModerationDecision.service.js";
import moderateReportBanTemp from "./moderateReportBanTemp.service.js";
import moderateReportBanPerm from "./moderateReportBanPerm.service.js";
import moderateReportWarn from "./moderateReportWarn.service.js";
import moderateReportIgnore from "./moderateReportIgnore.service.js";

const adminModerateReport = async ({
  targetId,
  targetType,
  reviewedBy,
  reviewComment,
  actionTaken,
  title,
  reasons,
  banDurationMs,
  warningDurationMs,
}: {
  targetId: string;
  targetType: ReportTargetType;
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
    targetType,
    status: "PENDING",
  });

  if (!foundReport) {
    throw new HttpError("Report not found", 404);
  }

  if (foundReport.targetUserId === reviewedBy) {
    throw new HttpError("Self-moderation is not allowed", 403);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: foundReport.targetUserId as string },
    select: { status: true },
  });

  if (!targetUser) {
    throw new HttpError("Target user not found", 404);
  }

  if (actionTaken !== "IGNORE" && targetUser.status === "TERMINATED") {
    throw new HttpError("Target user account is already terminated", 409);
  }

  const resolvedAt = new Date();
  const reportTargetUserId = foundReport.targetUserId as string;
  const reportContentId = String(foundReport.targetId);
  const shouldRemoveContent =
    actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP";
  const decisionId = crypto.randomUUID();
  const reportId = String(foundReport.id);
  const reporterUserId = foundReport.reportedBy as string;
  const reportMongoId = String(foundReport._id);
  const claimToken = crypto.randomUUID();

  const claimReport = await Report.findOneAndUpdate(
    {
      _id: foundReport._id,
      status: "PENDING",
      $or: [
        { reviewedBy: null },
        { claimExpiresAt: { $lte: resolvedAt } },
      ],
    },
    {
      reviewedBy,
      reviewComment,
      reviewedAt: resolvedAt,
      claimedAt: resolvedAt,
      claimExpiresAt: new Date(resolvedAt.getTime() + 24 * 60 * 60 * 1000),
      claimToken,
    },
    { new: true },
  );

  if (!claimReport) {
    throw new HttpError("Report already resolved", 409);
  }

  await clearReportsCache();

  await assertReportClaimIsCurrent({
    reportMongoId,
    reviewedBy,
    claimToken,
  });

  const context: ReportModerationContext = {
    reportId,
    reportMongoId,
    reportTargetUserId,
    reportContentId,
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

    await clearReportsCache();
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
    );

    await clearReportsCache();

    throw error;
  }
};

export default adminModerateReport;
