import type { ClientSession } from "mongoose";

import type {
  QuestionProcessingStateSet,
  QuestionReadinessInput,
} from "./questionProcessingState.types.js";

import QuestionProcessingState from "../../../models/questionProcessingState.model.js";

const completedSecurityVerifierStatuses = [
  "NOT_REQUIRED",
  "ALLOWED",
  "ALLOWED_WITH_CONSTRAINTS",
] as const;
const aiSuggestionEligibilityStatuses = ["ALLOWED", "CLARIFY"] as const;

const deriveQuestionReadiness = ({
  questionEligibilityStatus,
  securityVerifierStatus,
  embeddingStatus,
  questionVersion,
  similarQuestionsStatus,
  similarQuestionsComputedVersion,
}: QuestionReadinessInput) => {
  const securityComplete = completedSecurityVerifierStatuses.includes(
    securityVerifierStatus as (typeof completedSecurityVerifierStatuses)[number],
  );

  return {
    canGetAISuggestion:
      aiSuggestionEligibilityStatuses.includes(
        questionEligibilityStatus as (typeof aiSuggestionEligibilityStatuses)[number],
      ) && securityComplete,
    canGetAIAnswer:
      questionEligibilityStatus === "ALLOWED" &&
      securityComplete &&
      embeddingStatus === "READY" &&
      similarQuestionsStatus === "READY" &&
      similarQuestionsComputedVersion === questionVersion,
  };
};

const readinessUpdateStage = {
  $set: {
    canGetAISuggestion: {
      $and: [
        {
          $in: ["$questionEligibilityStatus", aiSuggestionEligibilityStatuses],
        },
        {
          $in: ["$securityVerifierStatus", completedSecurityVerifierStatuses],
        },
      ],
    },
    canGetAIAnswer: {
      $and: [
        { $eq: ["$questionEligibilityStatus", "ALLOWED"] },
        {
          $in: ["$securityVerifierStatus", completedSecurityVerifierStatuses],
        },
        { $eq: ["$embeddingStatus", "READY"] },
        { $eq: ["$similarQuestionsStatus", "READY"] },
        { $eq: ["$similarQuestionsComputedVersion", "$questionVersion"] },
      ],
    },
  },
};

const createQuestionProcessingState = async (
  questionId: unknown,
  questionVersion: number,
  session?: ClientSession,
) => {
  const [state] = await QuestionProcessingState.create(
    [
      {
        questionId,
        questionVersion,
        questionEligibilitySourceVersion: questionVersion,
        securityVerifierSourceVersion: questionVersion,
        moderationSourceVersion: questionVersion,
        ...deriveQuestionReadiness({
          questionEligibilityStatus: "PENDING",
          securityVerifierStatus: "NOT_REQUIRED",
          embeddingStatus: "NOT_STARTED",
          questionVersion,
          similarQuestionsStatus: "NOT_STARTED",
          similarQuestionsComputedVersion: null,
        }),
      },
    ],
    { session },
  );

  return state;
};

const buildProcessingStateFilter = ({
  questionId,
  questionVersion,
  match = {},
}: {
  questionId: unknown;
  questionVersion?: number;
  match?: Record<string, unknown>;
}) => ({
  questionId,
  ...(questionVersion === undefined ? {} : { questionVersion }),
  ...match,
});

const updateQuestionProcessingState = async ({
  questionId,
  questionVersion,
  match,
  set,
  session,
}: {
  questionId: unknown;
  questionVersion?: number;
  match?: Record<string, unknown>;
  set: QuestionProcessingStateSet;
  session?: ClientSession;
}) =>
  QuestionProcessingState.updateOne(
    buildProcessingStateFilter({ questionId, questionVersion, match }),
    [{ $set: set }, readinessUpdateStage],
    { session, updatePipeline: true },
  );

const findOneAndUpdateQuestionProcessingState = async ({
  questionId,
  questionVersion,
  match,
  set,
  session,
}: {
  questionId: unknown;
  questionVersion?: number;
  match?: Record<string, unknown>;
  set: QuestionProcessingStateSet;
  session?: ClientSession;
}) =>
  QuestionProcessingState.findOneAndUpdate(
    buildProcessingStateFilter({ questionId, questionVersion, match }),
    [{ $set: set }, readinessUpdateStage],
    { returnDocument: "after", session, updatePipeline: true },
  );

export {
  aiSuggestionEligibilityStatuses,
  completedSecurityVerifierStatuses,
  createQuestionProcessingState,
  deriveQuestionReadiness,
  findOneAndUpdateQuestionProcessingState,
  updateQuestionProcessingState,
};
