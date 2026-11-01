import Question from "../../../../models/question.model.js";
import QuestionProcessingState from "../../../../models/questionProcessingState.model.js";
import QuestionSettings from "../../../../models/questionSettings.model.js";
import QuestionVersion from "../../../../models/questionVersion.model.js";

const completedSecurityVerifierStatuses = new Set([
  "NOT_REQUIRED",
  "ALLOWED",
  "ALLOWED_WITH_CONSTRAINTS",
]);

const loadAiAnswerRequestEligibility = async (
  questionId: string,
  questionVersion: number,
) => {
  const [question, version, processingState, settings] = await Promise.all([
    Question.findById(questionId)
      .select("userId currentVersion isActive isDeleted")
      .lean<{
        userId: string;
        currentVersion: number;
        isActive: boolean;
        isDeleted: boolean;
      } | null>(),
    QuestionVersion.findOne({ questionId, version: questionVersion })
      .select("moderationStatus isActive")
      .lean<{
        moderationStatus: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";
        isActive: boolean;
      } | null>(),
    QuestionProcessingState.findOne({ questionId, questionVersion })
      .select(
        "questionEligibilityStatus securityVerifierStatus embeddingStatus similarQuestionsStatus similarQuestionsComputedVersion canGetAIAnswer",
      )
      .lean<{
        questionEligibilityStatus: string;
        securityVerifierStatus: string;
        embeddingStatus: string;
        similarQuestionsStatus: string;
        similarQuestionsComputedVersion: number | null;
        canGetAIAnswer: boolean;
      } | null>(),
    QuestionSettings.findOne({ questionId })
      .select("aiAnswerAutoGeneration")
      .lean<{ aiAnswerAutoGeneration: boolean } | null>(),
  ]);

  const questionIsCurrentAndActive = Boolean(
    question &&
      question.currentVersion === questionVersion &&
      question.isActive &&
      !question.isDeleted &&
      version?.isActive,
  );
  const isReady = Boolean(
    questionIsCurrentAndActive &&
      version &&
      ["APPROVED", "FLAGGED"].includes(version.moderationStatus) &&
      processingState &&
      processingState.questionEligibilityStatus === "ALLOWED" &&
      completedSecurityVerifierStatuses.has(
        processingState.securityVerifierStatus,
      ) &&
      processingState.embeddingStatus === "READY" &&
      processingState.similarQuestionsStatus === "READY" &&
      processingState.similarQuestionsComputedVersion === questionVersion &&
      processingState.canGetAIAnswer,
  );

  return {
    question,
    questionIsCurrentAndActive,
    isReady,
    aiAnswerAutoGeneration: settings?.aiAnswerAutoGeneration ?? false,
  };
};

export default loadAiAnswerRequestEligibility;
