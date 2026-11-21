import type {
  WebSearchEvalCase,
  WebSearchEvalEvidence,
  WebSearchEvalJudgeResult,
  WebSearchResultJudgment,
} from "./schema.js";

const RELEVANT_GRADE_THRESHOLD = 2;
const RANKING_CUTOFF = 5;

type WebSearchResultScore = WebSearchResultJudgment & WebSearchEvalEvidence;

type WebSearchCaseMetrics = {
  precisionAt5: number;
  nDCGAt5: number;
  meanAuthorityGrade: number;
  meanAuthorityGradeAt5: number;
  referenceFactCoverage: number;
  criticalFactCoverage: number | null;
  relevantResultsAt5: number;
  relevantResultsTotal: number;
  referenceFactsSupported: number;
  referenceFactsTotal: number;
  criticalFactsSupported: number;
  criticalFactsTotal: number;
};

type WebSearchCaseScore = {
  caseId: string;
  query: string;
  resultScores: WebSearchResultScore[];
  unsupportedFactIds: string[];
  missingFactIds: string[];
  missingCriticalFactIds: string[];
  missingRequiredPassageEvidence: boolean;
  metrics: WebSearchCaseMetrics;
};

const discountedCumulativeGain = (grades: number[], cutoff: number) =>
  grades
    .slice(0, cutoff)
    .reduce(
      (total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
      0,
    );

const calculateNdcgAt5 = (rankedGrades: number[]) => {
  const dcg = discountedCumulativeGain(rankedGrades, RANKING_CUTOFF);
  const idealDcg = discountedCumulativeGain(
    [...rankedGrades].sort((a, b) => b - a),
    RANKING_CUTOFF,
  );

  return idealDcg === 0 ? 0 : dcg / idealDcg;
};

const validateJudgeResult = (
  testCase: WebSearchEvalCase,
  results: WebSearchEvalEvidence[],
  judgeResult: WebSearchEvalJudgeResult,
) => {
  if (judgeResult.caseId !== testCase.id) {
    throw new Error(
      `Web search judge result case ID mismatch: expected ${testCase.id}, received ${judgeResult.caseId}`,
    );
  }

  const referenceFactIds = new Set(
    testCase.assertions.referenceFacts.map(({ id }) => id),
  );

  const judgmentsByRank = new Map<number, WebSearchResultJudgment>();

  for (const judgment of judgeResult.resultJudgments) {
    if (judgment.rank > results.length) {
      throw new Error(
        `Web search judge returned rank ${judgment.rank} without a matching result for case ${testCase.id}`,
      );
    }

    if (judgmentsByRank.has(judgment.rank)) {
      throw new Error(
        `Web search judge returned duplicate result rank ${judgment.rank} for case ${testCase.id}`,
      );
    }

    judgmentsByRank.set(judgment.rank, judgment);

    for (const factId of judgment.supportedFactIds) {
      if (!referenceFactIds.has(factId)) {
        throw new Error(
          `Web search judge referenced unknown fact ${factId} for case ${testCase.id}`,
        );
      }
    }
  }

  for (const factId of judgeResult.unsupportedFactIds) {
    if (!referenceFactIds.has(factId)) {
      throw new Error(
        `Web search judge referenced unknown unsupported fact ${factId} for case ${testCase.id}`,
      );
    }
  }

  for (let rank = 1; rank <= results.length; rank += 1) {
    if (!judgmentsByRank.has(rank)) {
      throw new Error(
        `Web search judge omitted result rank ${rank} for case ${testCase.id}`,
      );
    }
  }

  return judgmentsByRank;
};

const scoreWebSearchCase = (
  testCase: WebSearchEvalCase,
  results: WebSearchEvalEvidence[],
  judgeResult: WebSearchEvalJudgeResult,
): WebSearchCaseScore => {
  const judgmentsByRank = validateJudgeResult(testCase, results, judgeResult);

  const resultScores = results.map((result, index) => {
    const rank = index + 1;
    const judgment = judgmentsByRank.get(rank);

    if (!judgment) throw new Error(`Missing judgment for result rank ${rank}`);

    return { ...result, ...judgment };
  });

  const rankedGrades = resultScores.map(({ relevanceGrade }) => relevanceGrade);

  const relevantResultsAt5 = resultScores
    .slice(0, RANKING_CUTOFF)
    .filter(
      ({ relevanceGrade }) => relevanceGrade >= RELEVANT_GRADE_THRESHOLD,
    ).length;
  const referenceFacts = testCase.assertions.referenceFacts;
  const supportedFactIds = new Set(
    resultScores.flatMap(({ supportedFactIds: ids }) => ids),
  );
  const missingFacts = referenceFacts.filter(
    ({ id }) => !supportedFactIds.has(id),
  );
  const criticalFacts = referenceFacts.filter(({ critical }) => critical);
  const supportedCriticalFacts = criticalFacts.filter(({ id }) =>
    supportedFactIds.has(id),
  );

  return {
    caseId: testCase.id,
    query: testCase.input.query,
    resultScores,
    unsupportedFactIds: judgeResult.unsupportedFactIds,
    missingFactIds: missingFacts.map(({ id }) => id),
    missingCriticalFactIds: missingFacts
      .filter(({ critical }) => critical)
      .map(({ id }) => id),
    missingRequiredPassageEvidence:
      testCase.assertions.requirePassageEvidence && results.length === 0,
    metrics: {
      precisionAt5:
        resultScores.length === 0
          ? 0
          : relevantResultsAt5 / Math.min(RANKING_CUTOFF, resultScores.length),
      nDCGAt5: calculateNdcgAt5(rankedGrades),
      meanAuthorityGrade:
        resultScores.length === 0
          ? 0
          : resultScores.reduce(
              (total, { authorityGrade }) => total + authorityGrade,
              0,
            ) / resultScores.length,
      meanAuthorityGradeAt5:
        resultScores.length === 0
          ? 0
          : resultScores
              .slice(0, RANKING_CUTOFF)
              .reduce(
                (total, { authorityGrade }) => total + authorityGrade,
                0,
              ) / Math.min(RANKING_CUTOFF, resultScores.length),
      referenceFactCoverage:
        referenceFacts.length === 0
          ? 0
          : supportedFactIds.size / referenceFacts.length,
      criticalFactCoverage:
        criticalFacts.length === 0
          ? null
          : supportedCriticalFacts.length / criticalFacts.length,
      relevantResultsAt5,
      relevantResultsTotal: rankedGrades.filter(
        (grade) => grade >= RELEVANT_GRADE_THRESHOLD,
      ).length,
      referenceFactsSupported: referenceFacts.length - missingFacts.length,
      referenceFactsTotal: referenceFacts.length,
      criticalFactsSupported: supportedCriticalFacts.length,
      criticalFactsTotal: criticalFacts.length,
    },
  };
};

export {
  calculateNdcgAt5,
  discountedCumulativeGain,
  scoreWebSearchCase,
  validateJudgeResult,
};

export type { WebSearchCaseMetrics, WebSearchCaseScore, WebSearchResultScore };
