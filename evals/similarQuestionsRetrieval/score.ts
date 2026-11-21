import type { RetrievalCandidate } from "../../src/services/question/similarQuestions/retrieval/retrieval.types.js";

import type {
  RetrievalEvalCase,
  RetrievalRelevanceJudgment,
} from "./schema.js";
import {
  MIN_RELEVANT_GRADE,
  nDCGAtK,
  recallAtK,
  reciprocalRank,
  retrievalMetricKs,
} from "./metrics.js";

type RetrievalCandidateDiagnostic = RetrievalCandidate & {
  rank: number;
  relevanceGrade: number;
};

type RetrievalCaseMetrics = {
  recallAt5: number;
  recallAt10: number;
  recallAt15: number;
  nDCGAt5: number;
  nDCGAt10: number;
  nDCGAt15: number;
  reciprocalRank: number;
  relevantRetrievedAt5: number;
  relevantTotal: number;
};

type RetrievalCaseScore = {
  caseId: string;
  description: string;
  tags: string[];
  source: RetrievalEvalCase["source"];
  relevance: RetrievalRelevanceJudgment[];
  actual: RetrievalCandidateDiagnostic[];
  missingJudgedTargets: RetrievalRelevanceJudgment[];
  unjudgedRetrieved: RetrievalCandidateDiagnostic[];
  metrics: RetrievalCaseMetrics;
};

const makeVersionIdentity = (questionId: string, version: number) =>
  JSON.stringify([questionId, version]);

const getRelevanceGrade = (
  relevanceByIdentity: Map<string, RetrievalRelevanceJudgment>,
  candidate: RetrievalCandidate,
) =>
  relevanceByIdentity.get(
    makeVersionIdentity(candidate.questionId, candidate.version),
  )?.grade ?? 0;

const assertValidRanking = (
  evalCase: RetrievalEvalCase,
  actual: RetrievalCandidate[],
) => {
  const seenIdentities = new Set<string>();
  const sourceIdentity = makeVersionIdentity(
    evalCase.source.questionId,
    evalCase.source.version,
  );

  for (const candidate of actual) {
    const identity = makeVersionIdentity(
      candidate.questionId,
      candidate.version,
    );

    if (identity === sourceIdentity) {
      throw new Error(
        `Retrieval result contains the source question/version: ${identity}`,
      );
    }

    if (seenIdentities.has(identity)) {
      throw new Error(
        `Retrieval result contains a duplicate candidate: ${identity}`,
      );
    }

    seenIdentities.add(identity);
  }
};

const scoreRetrievalCase = (
  evalCase: RetrievalEvalCase,
  actual: RetrievalCandidate[],
): RetrievalCaseScore => {
  assertValidRanking(evalCase, actual);

  const relevanceByIdentity = new Map(
    evalCase.relevant.map((judgment) => [
      makeVersionIdentity(judgment.questionId, judgment.version),
      judgment,
    ]),
  );
  const actualWithDiagnostics = actual.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    relevanceGrade: getRelevanceGrade(relevanceByIdentity, candidate),
  }));
  const rankedGrades = actualWithDiagnostics.map(
    ({ relevanceGrade }) => relevanceGrade,
  );
  const knownRelevanceGrades = evalCase.relevant.map(({ grade }) => grade);
  const totalRelevant = knownRelevanceGrades.filter(
    (grade) => grade >= MIN_RELEVANT_GRADE,
  ).length;
  const relevantRetrievedAt5 = rankedGrades
    .slice(0, 5)
    .filter((grade) => grade >= MIN_RELEVANT_GRADE).length;

  const metricsByK = new Map(
    retrievalMetricKs.map((k) => [
      k,
      {
        recall: recallAtK(rankedGrades, totalRelevant, k),
        nDCG: nDCGAtK(rankedGrades, knownRelevanceGrades, k),
      },
    ]),
  );

  const retrievedIdentities = new Set(
    actual.map(({ questionId, version }) =>
      makeVersionIdentity(questionId, version),
    ),
  );

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    tags: evalCase.tags,
    source: evalCase.source,
    relevance: evalCase.relevant,
    actual: actualWithDiagnostics,
    missingJudgedTargets: evalCase.relevant.filter(
      ({ questionId, version }) =>
        !retrievedIdentities.has(makeVersionIdentity(questionId, version)),
    ),
    unjudgedRetrieved: actualWithDiagnostics.filter(
      ({ relevanceGrade }) => relevanceGrade === 0,
    ),
    metrics: {
      recallAt5: metricsByK.get(5)?.recall ?? 0,
      recallAt10: metricsByK.get(10)?.recall ?? 0,
      recallAt15: metricsByK.get(15)?.recall ?? 0,
      nDCGAt5: metricsByK.get(5)?.nDCG ?? 0,
      nDCGAt10: metricsByK.get(10)?.nDCG ?? 0,
      nDCGAt15: metricsByK.get(15)?.nDCG ?? 0,
      reciprocalRank: reciprocalRank(rankedGrades),
      relevantRetrievedAt5,
      relevantTotal: totalRelevant,
    },
  };
};

export type {
  RetrievalCandidateDiagnostic,
  RetrievalCaseMetrics,
  RetrievalCaseScore,
};

export { scoreRetrievalCase };
