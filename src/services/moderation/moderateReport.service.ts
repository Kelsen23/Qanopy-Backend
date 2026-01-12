import Report from "../../models/report.model.js";

import HttpError from "../../utils/httpError.util.js";
import publishSocketEvent from "../../utils/publishSocketEvent.util.js";
import deactivateContent from "../../utils/deactivateContent.util.js";

import prisma from "../../config/prisma.config.js";

import { redisPub } from "../../redis/redis.pubsub.js";

const moderateReport = async (
  reportId: string,
  {
    title,
    actionTaken,
    adminReasons,
    severity,
    banDurationMs,
  }: {
    title: string;
    actionTaken: "BAN_USER_PERM" | "BAN_USER_TEMP" | "WARN_USER" | "IGNORE";
    adminReasons: string[];
    severity: number;
    banDurationMs: number;
  },
) => {
  try {
    const report = await Report.findById(reportId);

    if (!report) throw new HttpError("Report not found", 404);

    if (report.status !== "REVIEWING" || report.aiDecision !== "UNCERTAIN")
      throw new HttpError("Report not available for manual moderation", 403);

    if (actionTaken === "BAN_USER_PERM") {
      const newBan = await prisma.$transaction(async (tx) => {
        const createdBan = await tx.ban.create({
          data: {
            userId: report.targetUserId as string,
            title,
            reasons: adminReasons,
            banType: "PERM",
            severity,
            bannedBy: "ADMIN_MODERATION",
          },
        });

        await tx.user.update({
          where: { id: report.targetUserId as string },
          data: { status: "TERMINATED" },
        });

        return createdBan;
      });

      await publishSocketEvent(
        report.targetUserId as string,
        "banUser",
        newBan,
      );

      redisPub.publish(
        "socket:disconnect",
        JSON.stringify(report.targetUserId as string),
      );

      const updatedReport = await Report.findByIdAndUpdate(
        report._id,
        {
          actionTaken,
          status: "RESOLVED",
          adminReasons,
          severity,
          isRemovingContent: true,
        },
        { new: true },
      );

      publishSocketEvent(report.reportedBy as string, "reportStatusChanged", {
        actionTaken: updatedReport?.actionTaken,
        status: updatedReport?.status,
        isRemovingContent: updatedReport?.isRemovingContent,
      });
    } else if (actionTaken === "BAN_USER_TEMP") {
      if (!banDurationMs)
        throw new HttpError(
          "banDurationMs is required for temporary bans",
          400,
        );

      const newBan = await prisma.$transaction(async (tx) => {
        const createdBan = await tx.ban.create({
          data: {
            userId: report.targetUserId as string,
            title,
            reasons: adminReasons,
            banType: "TEMP",
            severity,
            bannedBy: "ADMIN_MODERATION",
            expiresAt: new Date(Date.now() + banDurationMs),
            durationMs: banDurationMs,
          },
        });

        await tx.user.update({
          where: { id: report.targetUserId as string },
          data: { status: "SUSPENDED" },
        });

        return createdBan;
      });

      await publishSocketEvent(
        report.targetUserId as string,
        "banUser",
        newBan,
      );

      redisPub.publish(
        "socket:disconnect",
        JSON.stringify(report.targetUserId as string),
      );

      const updatedReport = await Report.findByIdAndUpdate(
        report._id,
        {
          actionTaken,
          status: "RESOLVED",
          adminReasons,
          severity,
          isRemovingContent: true,
        },
        { new: true },
      );

      publishSocketEvent(report.reportedBy as string, "reportStatusChanged", {
        actionTaken: updatedReport?.actionTaken,
        status: updatedReport?.status,
        isRemovingContent: updatedReport?.isRemovingContent,
      });
    } else if (actionTaken === "WARN_USER") {
      const newWarning = await prisma.warning.create({
        data: {
          userId: report.targetUserId as string,
          title,
          reasons: adminReasons,
          severity,
          warnedBy: "ADMIN_MODERATION",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      publishSocketEvent(report.targetUserId as string, "warnUser", newWarning);

      const updatedReport = await Report.findByIdAndUpdate(
        report._id,
        {
          actionTaken,
          status: "RESOLVED",
          isRemovingContent: false,
          adminReasons,
        },
        { new: true },
      );

      publishSocketEvent(report.reportedBy as string, "reportStatusChanged", {
        actionTaken: updatedReport?.actionTaken,
        status: updatedReport?.status,
        isRemovingContent: updatedReport?.isRemovingContent,
      });
    } else if (actionTaken === "IGNORE") {
      const updatedReport = await Report.findByIdAndUpdate(
        report._id,
        {
          actionTaken,
          status: "DISMISSED",
          adminReasons,
          severity,
          isRemovingContent: false,
        },
        { new: true },
      );

      publishSocketEvent(report.reportedBy as string, "reportStatusChanged", {
        actionTaken: updatedReport?.actionTaken,
        status: updatedReport?.status,
        isRemovingContent: updatedReport?.isRemovingContent,
      });
    }

    if (actionTaken === "BAN_USER_TEMP" || actionTaken === "BAN_USER_PERM") {
      deactivateContent(
        report.targetType as "Question" | "Answer" | "Reply",
        report.targetId as string,
      );
    }
  } catch (error) {
    console.error("Error in moderateReport service:", error);
    throw new HttpError("Error moderating report", 500);
  }
};

export default moderateReport;
