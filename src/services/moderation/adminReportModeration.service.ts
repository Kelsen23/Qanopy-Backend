import HttpError from "../../utils/httpError.util.js";

import Report from "../../models/report.model.js";

import prisma from "../../config/prisma.config.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";
import publishSocketEvent from "../../utils/publishSocketEvent.util.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAudit from "../../queues/moderationAudit.queue.js";
import deleteContentQueue from "../../queues/deleteContent.queue.js";

import crypto from "crypto";

type AdminReportActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";

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
  reputationDelta,
}: {
  targetId: string;
  targetType: "Question" | "Answer" | "Reply";
  reviewedBy: string;
  reviewComment?: string;
  actionTaken: AdminReportActionTaken;
  title: string;
  isRemovingContent: boolean;
  reasons?: string[];
  banDurationMs?: number;
  warningDurationMs?: number;
  reputationDelta?: number;
}) => {
  const foundReport = await Report.findOne({
    _id: targetId,
    targetType,
    status: "PENDING",
  });

  if (!foundReport) throw new HttpError("Report not found", 404);

  const resolvedAt = new Date();
  const reportTargetUserId = foundReport.targetUserId as string;
  const reportContentId = String(foundReport.targetId);
  const shouldRemoveContent =
    actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP" ? true : false;

  const decisionId = crypto.randomUUID();

  const updateReportStatus = async (
    status: "RESOLVED" | "DISMISSED",
    actionTaken: AdminReportActionTaken,
    meta: any,
  ) => {
    const updatedReport = await Report.findOneAndUpdate(
      { _id: foundReport._id, status: "PENDING" },
      {
        status,
        reviewedBy,
        reviewComment,
        actionTaken,
        isRemovingContent: shouldRemoveContent,
        reviewedAt: resolvedAt,
      },
      { new: true },
    );

    if (!updatedReport) throw new HttpError("Report already resolved", 409);

    await moderationAudit.add("updateReportStatus", {
      decisionId,
      targetType: "REPORT",
      targetId: updatedReport.id,
      targetUserId: updatedReport.targetUserId,
      actorType: "ADMIN_MODERATION",
      adminId: reviewedBy,
      actionTaken: "REMOVE",
      meta,
    });

    await publishSocketEvent(
      foundReport.reportedBy as string,
      "reportStatusChanged",
      {
        actionTaken: updatedReport.actionTaken,
        status: updatedReport.status,
        isRemovingContent: updatedReport.isRemovingContent,
      },
    );
  };

  const queueDeleteContentIfNeeded = async (meta: any) => {
    if (!shouldRemoveContent) return;

    await deleteContentQueue.add("removeModeratedContent", {
      userId: reportTargetUserId,
      targetType,
      targetId: reportContentId,
    });

    await moderationAudit.add("removeContent", {
      decisionId,
      targetType: "Content",
      targetId: foundReport.targetId,
      targetUserId: foundReport.targetUserId,
      actorType: "ADMIN_MODERATION",
      adminId: reviewedBy,
      actionTaken: "REMOVE",
      meta,
    });
  };

  switch (actionTaken) {
    case "BAN_TEMP": {
      if (!banDurationMs)
        throw new HttpError(
          "Banning user temporarily requires a ban duration",
          400,
        );

      const expiresAt = new Date(Date.now() + banDurationMs);

      const newBan = await prisma.$transaction(async (tx) => {
        const createdBan = await tx.ban.create({
          data: {
            userId: foundReport.targetUserId as string,
            title,
            reasons,
            banType: "TEMP",
            bannedBy: "ADMIN_MODERATION",
            expiresAt,
            durationMs: banDurationMs,
          },
        });

        await tx.user.update({
          where: { id: reportTargetUserId },
          data: { status: "SUSPENDED" },
        });

        return createdBan;
      });

      const meta = {
        title,
        reasons,
        banDurationMs,
        expiresAt,
        contentRemoved: shouldRemoveContent,
      };

      await updateReportStatus("RESOLVED", "BAN_TEMP", meta);

      await queueDeleteContentIfNeeded(meta);

      await moderationMetricsQueue.add("BAN_TEMP", {
        userId: reportTargetUserId,
      });

      await publishSocketEvent(reportTargetUserId, "ban", newBan);

      getRedisPub().publish(
        "socket:disconnect",
        JSON.stringify(reportTargetUserId),
      );

      break;
    }

    case "BAN_PERM": {
      const newBan = await prisma.ban.create({
        data: {
          userId: reportTargetUserId,
          title,
          reasons,
          banType: "PERM",
          bannedBy: "ADMIN_MODERATION",
        },
      });

      await prisma.user.update({
        where: { id: reportTargetUserId },
        data: { status: "TERMINATED" },
      });

      const meta = {
        title,
        reasons,
        contentRemoved: shouldRemoveContent,
      };

      await updateReportStatus("RESOLVED", "BAN_PERM", meta);
      await queueDeleteContentIfNeeded(meta);

      await moderationMetricsQueue.add("BAN_PERM", {
        userId: reportTargetUserId,
      });

      await publishSocketEvent(reportTargetUserId, "ban", newBan);

      getRedisPub().publish(
        "socket:disconnect",
        JSON.stringify(reportTargetUserId),
      );

      break;
    }

    case "WARN": {
      const warningTtlMs = warningDurationMs ?? 7 * 24 * 60 * 60 * 1000;

      const warning = await prisma.warning.create({
        data: {
          userId: reportTargetUserId,
          title,
          reasons,
          warnedBy: "ADMIN_MODERATION",
          expiresAt: new Date(Date.now() + warningTtlMs),
        },
      });

      if (!warningDurationMs)
        throw new HttpError("Warning duration required", 400);

      const meta = {
        title,
        reasons,
        warningDurationMs,
        expiresAt: new Date(Date.now() + warningDurationMs),
        contentRemoved: shouldRemoveContent,
      };

      await updateReportStatus("RESOLVED", "WARN", meta);
      await queueDeleteContentIfNeeded(meta);

      await moderationMetricsQueue.add("WARN", {
        userId: reportTargetUserId,
      });

      await publishSocketEvent(reportTargetUserId, "warn", warning);

      break;
    }

    case "IGNORE": {
      const meta = {
        title,
        reasons,
      };

      await updateReportStatus("DISMISSED", "IGNORE", meta);

      await moderationMetricsQueue.add("IGNORE", {
        userId: reportTargetUserId,
      });

      break;
    }
  }
};

export default adminModerateReport;
