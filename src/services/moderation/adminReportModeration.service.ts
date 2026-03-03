import HttpError from "../../utils/httpError.util.js";

import Report from "../../models/report.model.js";

import prisma from "../../config/prisma.config.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAudit from "../../queues/moderationAudit.queue.js";
import deleteContentQueue from "../../queues/deleteContent.queue.js";
import notificationQueue from "../../queues/notification.queue.js";

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
  const reportId = String(foundReport.id);
  const reporterUserId = foundReport.reportedBy as string;

  const queueNotification = async ({
    userId,
    type,
    referenceId,
    meta,
  }: {
    userId: string;
    type: "WARN" | "REPORT_UPDATE" | "REMOVE_CONTENT";
    referenceId: string;
    meta: Record<string, unknown>;
  }) => {
    await notificationQueue.add("createNotification", {
      userId,
      type,
      referenceId,
      meta,
    });
  };

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
      actionTaken,
      meta,
    });

    await queueNotification({
      userId: reporterUserId,
      type: "REPORT_UPDATE",
      referenceId: reportId,
      meta: {
        status: updatedReport.status,
        actionTaken: updatedReport.actionTaken,
        isRemovingContent: updatedReport.isRemovingContent,
      },
    });
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

    await queueNotification({
      userId: reportTargetUserId,
      type: "REMOVE_CONTENT",
      referenceId: reportContentId,
      meta: {
        reportId,
        targetType,
        actionTaken,
      },
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

      await prisma.$transaction(async (tx) => {
        const existingPermBan = await tx.ban.findFirst({
          where: {
            userId: reportTargetUserId,
            banType: "PERM",
          },
          select: { id: true },
        });

        if (existingPermBan) {
          throw new HttpError("User already has a permanent ban", 409);
        }

        const existingTempBan = await tx.ban.findFirst({
          where: {
            userId: reportTargetUserId,
            banType: "TEMP",
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });

        if (existingTempBan) {
          throw new HttpError("User already has an active temporary ban", 409);
        }

        await tx.ban.create({
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

      getRedisPub().publish(
        "socket:disconnect",
        JSON.stringify(reportTargetUserId),
      );

      break;
    }

    case "BAN_PERM": {
      await prisma.$transaction(async (tx) => {
        const existingPermBan = await tx.ban.findFirst({
          where: {
            userId: reportTargetUserId,
            banType: "PERM",
          },
          select: { id: true },
        });

        if (existingPermBan) {
          throw new HttpError("User already has a permanent ban", 409);
        }

        await tx.ban.create({
          data: {
            userId: reportTargetUserId,
            title,
            reasons,
            banType: "PERM",
            bannedBy: "ADMIN_MODERATION",
          },
        });

        await tx.user.update({
          where: { id: reportTargetUserId },
          data: { status: "TERMINATED" },
        });
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

      getRedisPub().publish(
        "socket:disconnect",
        JSON.stringify(reportTargetUserId),
      );

      break;
    }

    case "WARN": {
      if (!warningDurationMs)
        throw new HttpError("Warning duration required", 400);

      const expiresAt = new Date(Date.now() + warningDurationMs);

      const warning = await prisma.warning.create({
        data: {
          userId: reportTargetUserId,
          title,
          reasons,
          warnedBy: "ADMIN_MODERATION",
          expiresAt,
        },
      });

      const meta = {
        title,
        reasons,
        warningDurationMs,
        expiresAt,
        contentRemoved: shouldRemoveContent,
      };

      await updateReportStatus("RESOLVED", "WARN", meta);
      await queueDeleteContentIfNeeded(meta);

      await moderationMetricsQueue.add("WARN", {
        userId: reportTargetUserId,
      });

      await queueNotification({
        userId: reportTargetUserId,
        type: "WARN",
        referenceId: warning.id,
        meta: {
          title,
          reasons,
          expiresAt,
        },
      });

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
