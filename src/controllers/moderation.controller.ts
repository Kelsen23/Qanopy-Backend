import { Request, Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import HttpError from "../utils/httpError.util.js";
import addAdminModPoints from "../services/moderation/modPoints.service.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

import Report from "../models/report.model.js";

import prisma from "../config/prisma.config.js";

import reportModerationQueue from "../queues/reportModeration.queue.js";

import { redisPub } from "../redis/redis.pubsub.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

const createReport = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: reportedBy } = req.user;
    const { targetId, targetUserId, targetType, reportReason, reportComment } =
      req.body;

    let foundContent;

    switch (targetType) {
      case "Question":
        foundContent = await Question.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;

      case "Answer":
        foundContent = await Answer.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;

      case "Reply":
        foundContent = await Reply.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;
    }

    if (!foundContent) {
      throw new HttpError("Target content not found", 404);
    }

    if ((foundContent.userId as string).toString() !== targetUserId) {
      throw new HttpError("targetUserId does not match content owner", 400);
    }

    const newReport = await Report.create({
      reportedBy,
      targetId,
      targetUserId,
      targetType,
      reportReason,
      reportComment,
    });

    reportModerationQueue.add(
      "reportContent",
      { reportId: newReport._id?.toString() },
      { removeOnComplete: true, removeOnFail: false },
    );

    return res
      .status(201)
      .json({ message: "Report successfully created", report: newReport });
  },
);

const getReports = asyncHandler(async (req: Request, res: Response) => {
  const reportsForModeration = await Report.find({
    aiDecision: { $eq: "UNCERTAIN" },
    status: "REVIEWING",
  });

  return res.status(200).json({
    message: "Successfully received reports for moderation",
    reports: reportsForModeration,
  });
});

const moderateReport = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const reportId = req.params.id;
    const { title, actionTaken, adminReasons, severity, banDurationMs } =
      req.body;

    await addAdminModPoints(userId, actionTaken);

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
      switch (report.targetType) {
        case "Question":
          await Question.updateOne(
            { _id: report.targetId, isActive: true },
            { isActive: false },
          );
          break;
        case "Answer":
          await Answer.updateOne(
            { _id: report.targetId, isActive: true },
            { isActive: false },
          );
          break;
        case "Reply":
          await Reply.updateOne(
            { _id: report.targetId, isActive: true },
            { isActive: false },
          );
          break;
      }
    }

    return res.status(200).json({ message: "Report successfully reviewed" });
  },
);

const getBan = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const foundBans = await prisma.ban.findMany({ where: { userId } });

    const permBan = foundBans.find((ban) => ban.banType === "PERM");
    if (permBan) {
      return res.status(200).json({
        message: "Successfully received ban",
        ban: permBan,
      });
    }

    const tempBan = foundBans.find(
      (ban) =>
        ban.banType === "TEMP" &&
        ban.expiresAt &&
        ban.expiresAt > new Date(Date.now()),
    );

    return res
      .status(200)
      .json({ message: "Successfully received ban", ban: tempBan ?? null });
  },
);

const activateAccount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    if (req.user.status !== "SUSPENDED")
      return res.status(403).json({
        message: "Account can not be activated due to account's current state",
      });

    const foundTempBan = await prisma.ban.findFirst({
      where: { userId, banType: "TEMP", expiresAt: { gt: new Date() } },
    });

    if (foundTempBan)
      return res
        .status(403)
        .json({ message: "Could not activate account, ban still active" });

    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    return res.status(200).json({ message: "Successfully activated account" });
  },
);

const getWarnings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const foundWarnings = await prisma.warning.findMany({
      where: {
        userId,
        seen: false,
        expiresAt: { gt: new Date(Date.now()) },
      },
    });

    await prisma.warning.updateMany({
      where: { userId, seen: false, expiresAt: { gt: new Date(Date.now()) } },
      data: { delivered: true },
    });

    return res.status(200).json({
      message: "Successfully received warnings",
      warnings: foundWarnings,
    });
  },
);

const acknowledgeWarning = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.id;

    await prisma.warning.update({
      where: { id, userId },
      data: { seen: true, delivered: true },
    });

    return res.status(200).json({ message: "Warning acknowledged" });
  },
);

export {
  createReport,
  getReports,
  moderateReport,
  getBan,
  activateAccount,
  getWarnings,
  acknowledgeWarning,
};
