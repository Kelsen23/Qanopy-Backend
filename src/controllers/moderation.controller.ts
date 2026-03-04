import { Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import HttpError from "../utils/httpError.util.js";

import adminModerateReportService from "../services/moderation/adminReportModeration.service.js";
import adminModerateStrikeService from "../services/moderation/adminStrikeModeration.service.js";
import addAdminModPoints from "../services/moderation/modPoints.service.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";

import Report from "../models/report.model.js";

import prisma from "../config/prisma.config.js";

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

    return res
      .status(201)
      .json({ message: "Report successfully created", report: newReport });
  },
);

const moderate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { type, actionTaken } = req.body;

    if (type === "Report") {
      await adminModerateReportService({ ...req.body, reviewedBy: userId });
    } else {
      await adminModerateStrikeService({ ...req.body, reviewedBy: userId });
    }

    await addAdminModPoints(userId, actionTaken);

    return res.status(200).json({
      message: `Successfully moderated ${type.toString().toLowerCase()}`,
    });
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

const moderateContentImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    if (!objectKey.includes(userId)) {
      throw new HttpError("Unauthorized", 403);
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
  moderate,
  getBan,
  activateAccount,
  moderateContentImage,
};
