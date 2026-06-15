import { Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import {
  createReport as createReportService,
  getBan as getBanService,
  moderate as moderateService,
  moderateContentImage as moderateContentImageService,
} from "../services/moderation/moderation.service.js";

const createReport = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: reportedBy } = req.user;
    const { targetId, targetUserId, targetType, reportReason, reportComment } =
      req.body;

    const { report } = await createReportService({
      reportedBy,
      targetId,
      targetUserId,
      targetType,
      reportReason,
      reportComment,
    });

    return res
      .status(201)
      .json({ message: "Report successfully created", report });
  },
);

const moderate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const { message } = await moderateService({ userId, ...req.body });

    return res.status(200).json({ message });
  },
);

const getBan = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;

    const { ban, message } = await getBanService({ userId });

    return res.status(200).json({
      message,
      ban,
    });
  },
);

const moderateContentImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const { objectKey } = req.body;

    const { message } = await moderateContentImageService({
      userId,
      objectKey,
    });

    return res.status(202).json({ message });
  },
);

export { createReport, moderate, getBan, moderateContentImage };
