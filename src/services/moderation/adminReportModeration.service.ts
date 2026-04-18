import HttpError from "../../utils/httpError.util.js";
import queueNotification from "../../utils/queueNotification.util.js";
import { clearReportsCache } from "../../utils/clearCache.util.js";
import { makeJobId } from "../../utils/makeJobId.util.js";

import Report from "../../models/report.model.js";

import prisma from "../../config/prisma.config.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../queues/moderationAudit.queue.js";
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
}: {
  targetId: string;
  targetType: "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";
  reviewedBy: string;
  reviewComment?: string;
  actionTaken: AdminReportActionTaken;
  title: string;
  reasons?: string[];
  banDurationMs?: number;
  warningDurationMs?: number;
}) => {
  if (actionTaken === "BAN_TEMP") {
    if (banDurationMs === undefined) {
      throw new HttpError("banDurationMs is required for BAN_TEMP", 400);
    }
  }

  if (actionTaken === "WARN") {
    if (warningDurationMs === undefined) {
      throw new HttpError("warningDurationMs is required for WARN", 400);
    }
  }

  const foundReport = await Report.findOne({
    _id: targetId,
    targetType,
    status: "PENDING",
  });

  if (!foundReport) throw new HttpError("Report not found", 404);

  if (foundReport.targetUserId === reviewedBy) {
    throw new HttpError("Self-moderation is not allowed", 403);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: foundReport.targetUserId as string },
    select: { status: true },
  });

  if (!targetUser) throw new HttpError("Target user not found", 404);

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

  const claimReport = await Report.findOneAndUpdate(
    {
      _id: foundReport._id,
      status: "PENDING",
      reviewedBy: null,
    },
    {
      reviewedBy,
      reviewComment,
      reviewedAt: resolvedAt,
    },
    { new: true },
  );

  if (!claimReport) {
    throw new HttpError("Report already resolved", 409);
  }

  const updateReportStatus = async (
    status: "RESOLVED" | "DISMISSED",
    actionTaken: AdminReportActionTaken,
    meta: any,
  ) => {
    const updatedReport = await Report.findOneAndUpdate(
      { _id: foundReport._id, status: "PENDING", reviewedBy },
      {
        status,
        actionTaken,
        isRemovingContent: shouldRemoveContent,
      },
      { new: true },
    );

    if (!updatedReport) throw new HttpError("Report already resolved", 409);

    await moderationAuditQueue.add(
      "UPDATE_REPORT_STATUS",
      {
        decisionId,
        targetType: "REPORT",
        targetId: updatedReport.id,
        targetUserId: updatedReport.targetUserId,
        actorType: "ADMIN_MODERATION",
        adminId: reviewedBy,
        actionTaken,
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "updateReportStatus"),
      },
    );

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

    await deleteContentQueue.add(
      "REMOVE_MODERATED_CONTENT",
      {
        userId: reportTargetUserId,
        targetType,
        targetId: reportContentId,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "deleteContent",
          decisionId,
          "REMOVE_MODERATED_CONTENT",
          targetType,
          reportContentId,
        ),
      },
    );

    await moderationAuditQueue.add(
      "REMOVE_CONTENT",
      {
        decisionId,
        targetType: "CONTENT",
        targetId: foundReport.targetId,
        targetUserId: foundReport.targetUserId,
        actorType: "ADMIN_MODERATION",
        adminId: reviewedBy,
        actionTaken: "REMOVE",
        meta,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("moderationAudit", decisionId, "removeContent"),
      },
    );

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

  try {
    switch (actionTaken) {
      case "BAN_TEMP": {
        const expiresAt = new Date(Date.now() + (banDurationMs as number));

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
            throw new HttpError(
              "User already has an active temporary ban",
              409,
            );
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

        await moderationAuditQueue.add(
          "BAN_USER_TEMP",
          {
            decisionId,
            targetType: "USER",
            targetId: reportTargetUserId,
            targetUserId: reportTargetUserId,
            actorType: "ADMIN_MODERATION",
            adminId: reviewedBy,
            actionTaken: "BAN_TEMP",
            meta,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationAudit", decisionId, "banUserTemp"),
          },
        );

        await updateReportStatus("RESOLVED", "BAN_TEMP", meta);

        await queueDeleteContentIfNeeded(meta);

        await moderationMetricsQueue.add(
          "BAN_TEMP",
          {
            userId: reportTargetUserId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationMetrics", decisionId, "BAN_TEMP"),
          },
        );
        await queueNotification({
          userId: reportTargetUserId,
          type: "STRIKE",
          referenceId: reportId,
          meta: {
            actionTaken: "BAN_TEMP",
            title,
            reasons,
            expiresAt,
            reportId,
            targetType,
          },
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

        await moderationAuditQueue.add(
          "BAN_USER_PERM",
          {
            decisionId,
            targetType: "USER",
            targetId: reportTargetUserId,
            targetUserId: reportTargetUserId,
            actorType: "ADMIN_MODERATION",
            adminId: reviewedBy,
            actionTaken: "BAN_PERM",
            meta,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationAudit", decisionId, "banUserPerm"),
          },
        );

        await updateReportStatus("RESOLVED", "BAN_PERM", meta);
        await queueDeleteContentIfNeeded(meta);

        await moderationMetricsQueue.add(
          "BAN_PERM",
          {
            userId: reportTargetUserId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationMetrics", decisionId, "BAN_PERM"),
          },
        );

        await queueNotification({
          userId: reportTargetUserId,
          type: "STRIKE",
          referenceId: reportId,
          meta: {
            actionTaken: "BAN_PERM",
            title,
            reasons,
            reportId,
            targetType,
          },
        });

        getRedisPub().publish(
          "socket:disconnect",
          JSON.stringify(reportTargetUserId),
        );

        break;
      }

      case "WARN": {
        const expiresAt = new Date(Date.now() + (warningDurationMs as number));

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

        await moderationMetricsQueue.add(
          "WARN",
          {
            userId: reportTargetUserId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationMetrics", decisionId, "WARN"),
          },
        );

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

        await moderationMetricsQueue.add(
          "IGNORE",
          {
            userId: reportTargetUserId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId("moderationMetrics", decisionId, "IGNORE"),
          },
        );

        break;
      }
    }

    await clearReportsCache();
  } catch (error) {
    await Report.findOneAndUpdate(
      {
        _id: foundReport._id,
        status: "PENDING",
        reviewedBy,
      },
      {
        reviewedBy: null,
        reviewedAt: null,
        $unset: { reviewComment: 1 },
      },
    );

    throw error;
  }
};

export default adminModerateReport;
