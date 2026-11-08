import {
  queueContentModerationRoute,
  queueQuestionPipelineStep,
} from "../pipelineRouting.service.js";
import { invalidateSimilarQuestions } from "../../similarQuestions/similarQuestionsState.service.js";
import requestAiAnswer from "../../ai/answer/requestAiAnswer.service.js";

import Question from "../../../../models/question.model.js";
import QuestionVersion from "../../../../models/questionVersion.model.js";
import QuestionProcessingState from "../../../../models/questionProcessingState.model.js";
import QuestionSettings from "../../../../models/questionSettings.model.js";

type QuestionPipelineRouteDecision =
  | { type: "NOOP" }
  | { type: "MODERATE" }
  | { type: "ELIGIBILITY_GATE" }
  | { type: "QUESTION_SECURITY_VERIFIER" }
  | { type: "EMBED" }
  | { type: "SIMILAR" }
  | { type: "AI_ANSWER" };

type QuestionPipelineRouteState = {
  questionVersion: number;
  moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
  questionEligibilityStatus?:
    | "PENDING"
    | "PROCESSING"
    | "ALLOWED"
    | "CLARIFY"
    | "REJECTED";
  securityVerifierStatus?:
    | "NOT_REQUIRED"
    | "PENDING"
    | "PROCESSING"
    | "ALLOWED"
    | "ALLOWED_WITH_CONSTRAINTS"
    | "REJECTED";
  embeddingStatus?: "NOT_STARTED" | "PENDING" | "PROCESSING" | "READY";
  similarQuestionsStatus?: "NOT_STARTED" | "PENDING" | "PROCESSING" | "READY";
  similarQuestionsComputedVersion?: number | null;
  canGetAIAnswer?: boolean;
  aiAnswerAutoGeneration?: boolean;
  isActive: boolean;
  isDeleted: boolean;
  isCurrentVersion: boolean;
};

const completedSecurityVerifierStatuses = new Set<
  NonNullable<QuestionPipelineRouteState["securityVerifierStatus"]>
>(["NOT_REQUIRED", "ALLOWED", "ALLOWED_WITH_CONSTRAINTS"]);

const loadQuestionPipelineRouteState = async (
  questionId: string,
  version: number,
): Promise<QuestionPipelineRouteState | null> => {
  const [questionVersion, question, processingState, settings] =
    await Promise.all([
      QuestionVersion.findOne({ questionId, version })
        .select("moderationStatus")
        .lean<{
          moderationStatus: QuestionPipelineRouteState["moderationStatus"];
        }>(),
      Question.findOne({ _id: questionId })
        .select("currentVersion isActive isDeleted")
        .lean<{
          currentVersion: number;
          isActive: boolean;
          isDeleted: boolean;
        }>(),
      QuestionProcessingState.findOne({ questionId, questionVersion: version })
        .select(
          "questionEligibilityStatus securityVerifierStatus embeddingStatus similarQuestionsStatus similarQuestionsComputedVersion canGetAIAnswer",
        )
        .lean<{
          questionEligibilityStatus: QuestionPipelineRouteState["questionEligibilityStatus"];
          securityVerifierStatus: QuestionPipelineRouteState["securityVerifierStatus"];
          embeddingStatus: QuestionPipelineRouteState["embeddingStatus"];
          similarQuestionsStatus: QuestionPipelineRouteState["similarQuestionsStatus"];
          similarQuestionsComputedVersion: number | null;
          canGetAIAnswer: boolean;
        }>(),
      QuestionSettings.findOne({ questionId })
        .select("aiAnswerAutoGeneration")
        .lean<{ aiAnswerAutoGeneration: boolean }>(),
    ]);

  if (!questionVersion) return null;

  if (!question) {
    return {
      questionVersion: version,
      moderationStatus: questionVersion.moderationStatus,
      isActive: false,
      isDeleted: true,
      isCurrentVersion: false,
    };
  }

  if (question.currentVersion !== version) {
    return {
      questionVersion: version,
      moderationStatus: questionVersion.moderationStatus,
      isActive: question.isActive,
      isDeleted: question.isDeleted,
      isCurrentVersion: false,
    };
  }

  if (!processingState) {
    throw new Error(
      `Question processing state missing or stale: ${questionId}`,
    );
  }

  return {
    questionVersion: version,
    moderationStatus: questionVersion.moderationStatus,
    questionEligibilityStatus: processingState.questionEligibilityStatus,
    securityVerifierStatus: processingState.securityVerifierStatus,
    embeddingStatus: processingState.embeddingStatus,
    similarQuestionsStatus: processingState.similarQuestionsStatus,
    similarQuestionsComputedVersion:
      processingState.similarQuestionsComputedVersion,
    canGetAIAnswer: processingState.canGetAIAnswer,
    aiAnswerAutoGeneration: settings?.aiAnswerAutoGeneration ?? false,
    isActive: question.isActive,
    isDeleted: question.isDeleted,
    isCurrentVersion: true,
  };
};

const resolveQuestionPipelineRouteDecision = (
  state: QuestionPipelineRouteState | null,
): QuestionPipelineRouteDecision => {
  if (!state) return { type: "NOOP" };

  if (!state.isActive || state.isDeleted) return { type: "NOOP" };

  if (state.moderationStatus === "PENDING") return { type: "MODERATE" };
  if (state.moderationStatus === "REJECTED") return { type: "NOOP" };

  if (!state.isCurrentVersion) return { type: "NOOP" };

  if (state.questionEligibilityStatus === "PENDING") {
    return { type: "ELIGIBILITY_GATE" };
  }

  if (state.questionEligibilityStatus !== "ALLOWED") return { type: "NOOP" };

  if (state.securityVerifierStatus === "PENDING") {
    return { type: "QUESTION_SECURITY_VERIFIER" };
  }

  if (
    !state.securityVerifierStatus ||
    !completedSecurityVerifierStatuses.has(state.securityVerifierStatus)
  ) {
    return { type: "NOOP" };
  }

  if (state.embeddingStatus === "NOT_STARTED") {
    return { type: "EMBED" };
  }

  if (
    state.embeddingStatus === "READY" &&
    (state.similarQuestionsStatus === "NOT_STARTED" ||
      state.similarQuestionsStatus === "PENDING")
  ) {
    return { type: "SIMILAR" };
  }

  if (
    state.embeddingStatus === "READY" &&
    state.similarQuestionsStatus === "READY" &&
    state.similarQuestionsComputedVersion === state.questionVersion &&
    state.canGetAIAnswer === true &&
    state.aiAnswerAutoGeneration === true
  ) {
    return { type: "AI_ANSWER" };
  }

  return { type: "NOOP" };
};

const questionRouter = async (questionId: string, version: number) => {
  const routeState = await loadQuestionPipelineRouteState(questionId, version);

  if (
    routeState?.isCurrentVersion &&
    (routeState.moderationStatus === "PENDING" ||
      routeState.moderationStatus === "REJECTED" ||
      !routeState.isActive ||
      routeState.isDeleted ||
      routeState.questionEligibilityStatus !== "ALLOWED" ||
      !completedSecurityVerifierStatuses.has(
        routeState.securityVerifierStatus as NonNullable<
          QuestionPipelineRouteState["securityVerifierStatus"]
        >,
      ) ||
      routeState.embeddingStatus !== "READY")
  ) {
    await invalidateSimilarQuestions(questionId, version);
  }

  const routeDecision = resolveQuestionPipelineRouteDecision(routeState);

  if (routeDecision.type === "MODERATE") {
    return queueContentModerationRoute({
      contentType: "QUESTION",
      contentId: questionId,
      version,
    });
  }

  if (routeDecision.type === "ELIGIBILITY_GATE") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "ELIGIBILITY_GATE",
    });
  }

  if (routeDecision.type === "QUESTION_SECURITY_VERIFIER") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "QUESTION_SECURITY_VERIFIER",
    });
  }

  if (routeDecision.type === "EMBED") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "EMBED",
    });
  }

  if (routeDecision.type === "SIMILAR") {
    return queueQuestionPipelineStep({
      questionId,
      version,
      step: "SIMILAR",
    });
  }

  if (routeDecision.type === "AI_ANSWER") {
    return requestAiAnswer({
      questionId,
      questionVersion: version,
      generationReason: "INITIAL_AUTO",
    });
  }
};

export default questionRouter;

export { loadQuestionPipelineRouteState, resolveQuestionPipelineRouteDecision };
