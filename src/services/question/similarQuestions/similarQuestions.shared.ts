const similarQuestionScoreThreshold = 0.75;
const similarQuestionResultLimit = 3;
const aiAnswerSimilarQuestionScoreThreshold = 0.7;
const aiAnswerSimilarQuestionResultLimit = 8;

const downstreamAllowedSecurityVerifierStatuses = [
  "NOT_REQUIRED",
  "ALLOWED",
  "ALLOWED_WITH_CONSTRAINTS",
] as const;

type SimilarQuestionsJobData = {
  questionId: string;
  version: number;
};

export {
  aiAnswerSimilarQuestionResultLimit,
  aiAnswerSimilarQuestionScoreThreshold,
  downstreamAllowedSecurityVerifierStatuses,
  similarQuestionResultLimit,
  similarQuestionScoreThreshold,
  type SimilarQuestionsJobData,
};
