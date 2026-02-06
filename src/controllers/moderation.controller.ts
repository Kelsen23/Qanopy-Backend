import { Request, Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import HttpError from "../utils/httpError.util.js";

import addAdminModPoints from "../services/moderation/modPoints.service.js";
import moderateReportService from "../services/moderation/moderateReport.service.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

import Report from "../models/report.model.js";

import prisma from "../config/prisma.config.js";

import reportModerationQueue from "../queues/reportModeration.queue.js";
import imageModerationQueue from "../queues/imageModeration.queue.js";

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

    const { actionTaken } = req.body;

    await addAdminModPoints(userId, actionTaken);

    await moderateReportService(reportId, req.body);

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

const moderateContentImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    if (
      new RegExp(
        `^temp\\/content\\/${userId}\\/[a-zA-Z0-9_.-]+\\.(png|jpg|jpeg)$`,
        "i",
      ).test(objectKey)
    ) {
      throw new HttpError("Invalid object key", 400);
    }

    await imageModerationQueue.add("content", {
      userId,
      objectKey,
    });

    return res.status(202).json({
      message: "Image uploaded and queued for moderation",
    });
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
  moderateContentImage,
};
