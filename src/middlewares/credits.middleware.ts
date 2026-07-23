import { NextFunction, Response } from "express";
import mongoose from "mongoose";

import asyncHandler from "./asyncHandler.middleware.js";

import type AuthenticatedRequest from "../types/authenticatedRequest.type.js";
import type { CreditOperationType } from "../generated/prisma/client.js";

import calculateCreditCharge from "../services/user/credits/calculateCreditCharge.service.js";
import chargeCreditsService from "../services/user/credits/chargeCredits.service.js";

import QuestionVersion from "../models/questionVersion.model.js";
import AiAnswer from "../models/aiAnswer.model.js";
import AiSuggestion from "../models/aiSuggestion.model.js";

const getQuestionVersionText = async (questionId: string, version: number) => {
  if (!mongoose.Types.ObjectId.isValid(questionId)) return "";

  const foundVersion = await QuestionVersion.findOne({
    questionId,
    version,
  })
    .select("title body tags")
    .lean();

  if (!foundVersion) return "";

  return [
    String(foundVersion.title ?? ""),
    String(foundVersion.body ?? ""),
    Array.isArray(foundVersion.tags) ? foundVersion.tags.join(" ") : "",
  ].join("\n");
};

const hasExistingBillableResult = async ({
  type,
  questionId,
  version,
}: {
  type: CreditOperationType;
  questionId: string;
  version: number;
}) => {
  if (!mongoose.Types.ObjectId.isValid(questionId)) return false;

  if (type === "AI_SUGGESTION") {
    return !!(await AiSuggestion.exists({ questionId, version }));
  }

  if (type === "AI_ANSWER") {
    return !!(await AiAnswer.exists({ questionId, questionVersion: version }));
  }

  return false;
};

const chargeCredits = (type: "AI_SUGGESTION" | "AI_ANSWER") =>
  asyncHandler(
    async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.id;
      const { questionId } = req.params;
      const version = Number(req.body.version);

      if (!questionId) {
        return next();
      }

      if (await hasExistingBillableResult({ type, questionId, version })) {
        return next();
      }

      const operationKey = `${type}:${userId}:${questionId}:${version}`;
      const content = await getQuestionVersionText(questionId, version);
      const amount = await calculateCreditCharge({ userId, type, content });

      req.creditCharge = await chargeCreditsService({
        userId,
        operationKey,
        type,
        amount,
      });

      next();
    },
  );

export default chargeCredits;
