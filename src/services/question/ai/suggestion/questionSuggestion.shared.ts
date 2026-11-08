import crypto from "crypto";

import type { QuestionSuggestionResult } from "../../../../validations/question.schema.js";

import routeNotification from "../../../notification/routeNotification.service.js";
import calculateCreditCharge from "../../../user/credits/calculateCreditCharge.service.js";
import chargeCredits from "../../../user/credits/chargeCredits.service.js";
import makeCreditOperationKey from "../../../user/credits/creditOperationKey.shared.js";
import refundCreditCharge from "../../../user/credits/refundCreditCharge.service.js";
import { toPublicAiSuggestion } from "../../question.response.js";
import { loadQuestionWithProcessingState } from "../../processingState/questionProcessingState.query.js";

import prisma from "../../../../config/prisma.config.js";

import HttpError from "../../../../utils/http/httpError.util.js";
import convertQuestionToLLMText from "../../../../utils/question/convertQuestionToLLMText.util.js";
import normalizeText from "../../../../utils/question/normalizeText.util.js";

import AiSuggestion from "../../../../models/aiSuggestion.model.js";
import EligibilityGateActionLog from "../../../../models/eligibilityGateActionLog.model.js";
import Notification from "../../../../models/notification.model.js";
import QuestionVersion from "../../../../models/questionVersion.model.js";

type GenerateQuestionSuggestionRequestInput = {
  userId: string;
  questionId: string;
  version: number;
};

type GenerateQuestionSuggestionRequestStatus = "EXISTING" | "GENERATED";

type GenerateQuestionSuggestionRequestResult = {
  message: string;
  status: GenerateQuestionSuggestionRequestStatus;
  suggestion: ReturnType<typeof toPublicAiSuggestion>;
};

type QuestionEligibilityGateDiagnosis = {
  decision: "ALLOW" | "CLARIFY" | "REJECT";
  questionEligibilityStatus: "ALLOWED" | "CLARIFY" | "REJECTED";
  userFacingReason: string;
  internalReason: string;
};

type QuestionSuggestionContext = {
  question: any;
  title: string;
  body: string;
  tags: string[];
  questionText: string;
  eligibilityGateDiagnosis: QuestionEligibilityGateDiagnosis | null;
};

type QuestionSuggestionCreditCharge = {
  operationKey: string;
  ownerReason: string;
  refundOnDuplicate: boolean;
  refundOnFailure: boolean;
};

const AI_SUGGESTION_MESSAGE = "AI suggestion successfully received";

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;

const isEligibleModerationStatus = (status: unknown) =>
  status === "APPROVED" || status === "FLAGGED";

const makeQuestionSuggestionCreditOperationKey = ({
  userId,
  questionId,
  version,
}: GenerateQuestionSuggestionRequestInput) =>
  makeCreditOperationKey({
    type: "AI_SUGGESTION",
    userId,
    questionId,
    version,
  });

const makeQuestionSuggestionCreditOwnerReason = () =>
  `AI_SUGGESTION_ATTEMPT:${crypto.randomUUID()}`;

const getSuggestionGeneratedAt = (suggestion: any) =>
  suggestion.meta?.generatedAt ??
  suggestion.createdAt?.toISOString?.() ??
  new Date().toISOString();

const buildQuestionSuggestionResult = (
  suggestion: unknown,
  status: GenerateQuestionSuggestionRequestStatus,
): GenerateQuestionSuggestionRequestResult => ({
  message: AI_SUGGESTION_MESSAGE,
  status,
  suggestion: toPublicAiSuggestion(suggestion),
});

const findExistingQuestionSuggestion = async (
  questionId: string,
  version: number,
) =>
  AiSuggestion.findOne({
    questionId,
    version,
  }).lean();

const loadQuestionEligibilityGateDiagnosis = async ({
  userId,
  questionId,
  version,
}: GenerateQuestionSuggestionRequestInput): Promise<QuestionEligibilityGateDiagnosis | null> => {
  const diagnosis = await EligibilityGateActionLog.findOne({
    userId,
    questionId,
    version,
    stage: "QUESTION_ELIGIBILITY_GATE",
  })
    .select(
      "-_id decision questionEligibilityStatus userFacingReason internalReason",
    )
    .sort({ createdAt: -1 })
    .lean<QuestionEligibilityGateDiagnosis>();

  return diagnosis ?? null;
};

const loadQuestionSuggestionContext = async ({
  userId,
  questionId,
  version,
}: GenerateQuestionSuggestionRequestInput): Promise<QuestionSuggestionContext> => {
  const question = await loadQuestionWithProcessingState({
    questionId,
    questionMatch: { userId },
  });

  if (!question) throw new HttpError("Question not found", 404);
  if (!question.processingState) {
    throw new Error("Question processing state missing");
  }
  if (!question.isActive) throw new HttpError("Question not active", 410);

  if (Number(question.currentVersion) !== version) {
    throw new HttpError(
      `Stale version. Current version is ${question.currentVersion}`,
      409,
    );
  }
  if (
    Number(question.processingState.questionVersion) !==
    Number(question.currentVersion)
  ) {
    throw new Error("Question processing state is stale");
  }

  if (!isEligibleModerationStatus(question.processingState.moderationStatus)) {
    throw new HttpError("Question moderation status is not eligible", 400);
  }

  if (!question.processingState.canGetAISuggestion) {
    throw new HttpError("Question is not eligible for AI suggestion", 400);
  }

  const questionVersion = await QuestionVersion.findOne({
    questionId,
    userId,
    version,
    moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
  })
    .select("_id isActive title body tags")
    .lean();

  if (!questionVersion) throw new HttpError("Version not found", 404);
  if (!questionVersion.isActive) throw new HttpError("Version not active", 410);

  const title = String(questionVersion.title ?? "");
  const body = String(questionVersion.body ?? "");
  const tags = Array.isArray(questionVersion.tags)
    ? questionVersion.tags.map(String)
    : [];
  const questionText = convertQuestionToLLMText(
    normalizeText(title),
    normalizeText(body),
    tags,
  );
  const eligibilityGateDiagnosis = await loadQuestionEligibilityGateDiagnosis({
    userId,
    questionId,
    version,
  });

  return {
    question: {
      ...question,
      securityVerifierStatus: question.processingState.securityVerifierStatus,
    },
    title,
    body,
    tags,
    questionText,
    eligibilityGateDiagnosis,
  };
};

const chargeQuestionSuggestionCredits = async ({
  userId,
  questionId,
  version,
  questionText,
}: GenerateQuestionSuggestionRequestInput & {
  questionText: string;
}): Promise<QuestionSuggestionCreditCharge> => {
  const operationKey = makeQuestionSuggestionCreditOperationKey({
    userId,
    questionId,
    version,
  });
  const ownerReason = makeQuestionSuggestionCreditOwnerReason();
  const existingOperation = await prisma.creditOperation.findUnique({
    where: { operationKey },
  });

  if (existingOperation?.status === "CHARGED") {
    await refundCreditCharge({
      operationKey,
      expectedReason: existingOperation.reason,
      reason: "Recovering orphaned AI suggestion charge",
    });
  }

  if (existingOperation?.status === "REFUND_PENDING") {
    throw new HttpError("Credit refund pending for this operation", 409);
  }

  const amount = await calculateCreditCharge({
    userId,
    type: "AI_SUGGESTION",
    content: questionText,
  });
  const charge = await chargeCredits({
    userId,
    operationKey,
    type: "AI_SUGGESTION",
    amount,
    reason: ownerReason,
  });

  return {
    operationKey: charge.operationKey,
    ownerReason,
    refundOnDuplicate: charge.chargedNow,
    refundOnFailure: charge.chargedNow,
  };
};

const refundQuestionSuggestionCharge = async ({
  operationKey,
  ownerReason,
  shouldRefundCharge,
  reason,
}: {
  operationKey: string | null;
  ownerReason: string | null;
  shouldRefundCharge: boolean;
  reason: string;
}) => {
  if (!operationKey || !shouldRefundCharge) return;

  await refundCreditCharge({
    operationKey,
    expectedReason: ownerReason,
    reason,
  });
};

const hasQuestionSuggestionReadyNotification = async ({
  userId,
  questionId,
  version,
}: {
  userId: string;
  questionId: string;
  version: number;
}) =>
  Boolean(
    await Notification.exists({
      recipientId: userId,
      event: "AI_SUGGESTION_READY",
      "target.entityType": "QUESTION",
      "target.entityId": questionId,
      "target.questionVersion": version,
    }),
  );

const createQuestionSuggestion = async ({
  userId,
  questionId,
  version,
  suggestion,
  metadata,
  generatedAt,
}: {
  userId: string;
  questionId: string;
  version: number;
  suggestion: QuestionSuggestionResult;
  metadata: unknown;
  generatedAt: string;
}) =>
  AiSuggestion.create({
    questionId,
    userId,
    version,
    suggestedTitle: suggestion.suggestedTitle,
    suggestedBody: suggestion.suggestedBody,
    suggestedTags: suggestion.suggestedTags,
    improvementTips: suggestion.improvementTips,
    meta: {
      questionId,
      questionVersion: version,
      generatedAt,
      source: "llmGateway",
      llm: metadata,
    },
  });

const notifyQuestionSuggestionReady = async ({
  userId,
  questionId,
  version,
  generatedAt,
}: {
  userId: string;
  questionId: string;
  version: number;
  generatedAt: string;
}) => {
  try {
    await routeNotification({
      recipientId: userId,
      event: "AI_SUGGESTION_READY",
      target: {
        entityType: "QUESTION",
        entityId: questionId,
        questionVersion: version,
      },
      meta: {
        questionId,
        questionVersion: version,
        generatedAt,
        source: "llmGateway",
      },
    });
  } catch (error) {
    console.error(
      `Failed to queue AI suggestion ready notification for question ${questionId} version ${version}:`,
      error,
    );
  }
};

const notifyMissingQuestionSuggestionReady = async ({
  userId,
  questionId,
  version,
  suggestion,
}: {
  userId: string;
  questionId: string;
  version: number;
  suggestion: unknown;
}) => {
  try {
    const hasNotification = await hasQuestionSuggestionReadyNotification({
      userId,
      questionId,
      version,
    });

    if (hasNotification) return;

    await notifyQuestionSuggestionReady({
      userId,
      questionId,
      version,
      generatedAt: getSuggestionGeneratedAt(suggestion),
    });
  } catch (error) {
    console.error(
      `Failed to replay AI suggestion ready notification for question ${questionId} version ${version}:`,
      error,
    );
  }
};

export {
  buildQuestionSuggestionResult,
  chargeQuestionSuggestionCredits,
  createQuestionSuggestion,
  findExistingQuestionSuggestion,
  isDuplicateKeyError,
  loadQuestionSuggestionContext,
  notifyMissingQuestionSuggestionReady,
  notifyQuestionSuggestionReady,
  refundQuestionSuggestionCharge,
};

export type {
  QuestionEligibilityGateDiagnosis,
  GenerateQuestionSuggestionRequestInput,
  GenerateQuestionSuggestionRequestResult,
  GenerateQuestionSuggestionRequestStatus,
};
