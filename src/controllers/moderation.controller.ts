import { Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import HttpError from "../utils/httpError.util.js";

import { clearReportsCache } from "../utils/clearCache.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import adminModerateReportService from "../services/moderation/adminReportModeration.service.js";
import adminModerateStrikeService from "../services/moderation/adminStrikeModeration.service.js";
import {
  checkAdminModPointsLimit,
  addAdminModPoints,
} from "../services/moderation/modPoints.service.js";

import Question from "../models/question.model.js";
import Answer from "../models/answer.model.js";
import Reply from "../models/reply.model.js";
import AiAnswerFeedback from "../models/aiAnswerFeedback.model.js";

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
      case "QUESTION":
        foundContent = await Question.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;

      case "ANSWER":
        foundContent = await Answer.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;

      case "REPLY":
        foundContent = await Reply.findOne(
          { _id: targetId, isActive: true },
          { userId: 1 },
        );
        break;

      case "AI_ANSWER_FEEDBACK":
        foundContent = await AiAnswerFeedback.findOne(
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
    await clearReportsCache();

    return res
      .status(201)
      .json({ message: "Report successfully created", report: newReport });
  },
);

const moderate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { type, actionTaken } = req.body;
    const normalizedType = String(type).toUpperCase();

    await checkAdminModPointsLimit(userId);

    if (normalizedType === "REPORT") {
      await adminModerateReportService({ ...req.body, reviewedBy: userId });
    } else {
      await adminModerateStrikeService({ ...req.body, reviewedBy: userId });
    }

    await addAdminModPoints(userId, actionTaken);

    return res.status(200).json({
      message: `Successfully moderated ${normalizedType.toLowerCase()}`,
    });
  },
);

const getBan = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const now = new Date();

    const foundBan = await prisma.ban.findFirst({
      where: {
        userId,
        OR: [
          { banType: "TEMP", expiresAt: { gt: now } },
          { banType: "PERM", expiresAt: null },
        ],
      },
      orderBy: { banType: "asc" },
    });

    if (!foundBan) {
      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
    }

    return res.status(200).json({
      message: foundBan ? "Successfully received ban" : "Active ban not found",
      ban: foundBan ?? null,
    });
  },
);

const moderateContentImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    if (!objectKey.includes(userId)) {
      throw new HttpError("Unauthorized", 403);
    }

    await imageModerationQueue.add(
      "CONTENT",
      {
        userId,
        objectKey,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId("imageModeration", "CONTENT", userId, objectKey),
      },
    );

    return res.status(202).json({
      message: "Image uploaded and queued for moderation",
    });
  },
);

export { createReport, moderate, getBan, moderateContentImage };
