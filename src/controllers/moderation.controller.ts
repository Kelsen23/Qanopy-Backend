import { Response } from "express";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

import asyncHandler from "../middlewares/asyncHandler.middleware.js";

import {
  createReport as createReportService,
  getBan as getBanService,
  moderate as moderateService,
  unbanUser as unbanUserService,
} from "../services/moderation/moderation.service.js";

const createReport = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: reportedBy } = req.user;
    const {
      targetId,
      targetType,
      targetContentVersion,
      reportReason,
      reportComment,
    } = req.body;

    const { report } = await createReportService({
      reportedBy,
      targetId,
      targetType,
      targetContentVersion,
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

const removeBan = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const reviewedBy = req.user.id;
    const { userId } = req.body;

    const result = await unbanUserService({
      userId,
      reviewedBy,
    });

    return res.status(200).json(result);
  },
);

export { createReport, moderate, getBan, removeBan };
