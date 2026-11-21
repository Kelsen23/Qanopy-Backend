import type {
  RetrievalCandidate,
  RetrievalInput,
} from "../../src/services/question/similarQuestions/retrieval/retrieval.types.js";
import type { RetrievalCorpus, RetrievalEvalCase } from "./schema.js";
import { scoreRetrievalCase, type RetrievalCaseScore } from "./score.js";

type DatasetName = "dev" | "holdout" | "regression";
type DatasetConfig = {
  casesPath: string;
  corpusPath: string;
  reportDirectory: string;
};

type RetrievalEvalCaseResult = {
  retrievalName: string;
  caseId: string;
  description: string;
  tags: string[];
  status: "PASS" | "EXECUTION_FAILURE";
  source: RetrievalEvalCase["source"];
  actual: RetrievalCandidate[];
  score?: RetrievalCaseScore;
  error?: string;
  latencyMs: number;
};

type RetrievalEvalSummary = {
  totalCases: number;
  successfulExecutions: number;
  executionFailures: number;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  meanRecallAt5: number | null;
  meanRecallAt10: number | null;
  meanRecallAt15: number | null;
  meanReciprocalRank: number | null;
  meanNDCGAt5: number | null;
  meanNDCGAt10: number | null;
  meanNDCGAt15: number | null;
  totalRelevantRetrievedAt5: number;
  totalRelevantTargets: number;
  unjudgedRetrieved: number;
  missingJudgedTargets: number;
};

type RetrievalEvalRunnerDependencies = {
  loadCases: (filename: string) => Promise<RetrievalEvalCase[]>;
  loadCorpus: (filename: string) => Promise<RetrievalCorpus>;
  retrieve: (input: RetrievalInput) => Promise<RetrievalCandidate[]>;
  now: () => number;
  getTimestamp: () => string;
  getGitCommit: () => string | undefined;
  writeReport: (filename: string, report: unknown) => Promise<void>;
  createReportDirectory: (directory: string) => Promise<void>;
  log: (...values: unknown[]) => void;
};

type RunRetrievalEvalOptions = {
  retrievalName: string;
  dataset: DatasetName;
  datasetConfig: DatasetConfig;
  reportMetadata?: Record<string, unknown>;
  dependencies: RetrievalEvalRunnerDependencies;
};

const makeVersionIdentity = (questionId: string, version: number) =>
  JSON.stringify([questionId, version]);

const getSourceQuestion = (
  testCase: RetrievalEvalCase,
  corpus: RetrievalCorpus,
) => {
  const sourceIdentity = makeVersionIdentity(
    testCase.source.questionId,
    testCase.source.version,
  );
  return corpus.find(
    (question) =>
      makeVersionIdentity(question.questionId, question.version) ===
      sourceIdentity,
  );
};

const validateCorpusReferences = (
  testCases: RetrievalEvalCase[],
  corpus: RetrievalCorpus,
) => {
  const corpusIdentities = new Set(
    corpus.map(({ questionId, version }) =>
      makeVersionIdentity(questionId, version),
    ),
  );

  for (const testCase of testCases) {
    const references = [testCase.source, ...testCase.relevant];

    for (const reference of references) {
      const identity = makeVersionIdentity(
        reference.questionId,
        reference.version,
      );

      if (!corpusIdentities.has(identity)) {
        throw new Error(
          `Retrieval eval case ${testCase.id} references question/version missing from corpus: ${reference.questionId}:${reference.version}`,
        );
      }
    }
  }
};

const runCase = async (
  testCase: RetrievalEvalCase,
  corpus: RetrievalCorpus,
  dependencies: Pick<RetrievalEvalRunnerDependencies, "retrieve" | "now">,
  retrievalName: string,
): Promise<RetrievalEvalCaseResult> => {
  const startedAt = dependencies.now();
  let actual: RetrievalCandidate[] = [];

  try {
    const source = getSourceQuestion(testCase, corpus);
    if (!source) {
      throw new Error(
        `Source question/version is missing from retrieval corpus: ${testCase.source.questionId}:${testCase.source.version}`,
      );
    }

    actual = await dependencies.retrieve({
      sourceQuestionId: source.questionId,
      sourceVersion: source.version,
      title: source.title,
      body: source.body,
      tags: source.tags,
      limit: 50,
    });
    const score = scoreRetrievalCase(testCase, actual);

    return {
      retrievalName,
      caseId: testCase.id,
      description: testCase.description,
      tags: testCase.tags,
      status: "PASS",
      source: testCase.source,
      actual,
      score,
      latencyMs: dependencies.now() - startedAt,
    };
  } catch (error) {
    return {
      retrievalName,
      caseId: testCase.id,
      description: testCase.description,
      tags: testCase.tags,
      status: "EXECUTION_FAILURE",
      source: testCase.source,
      actual,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: dependencies.now() - startedAt,
    };
  }
};

const calculateMean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;

const calculateMedian = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const calculateSummary = (
  cases: RetrievalEvalCaseResult[],
): RetrievalEvalSummary => {
  const successfulCases = cases.filter(({ status }) => status === "PASS");
  const scores = successfulCases.flatMap(({ score }) => (score ? [score] : []));
  const latencies = cases.map(({ latencyMs }) => latencyMs);

  return {
    totalCases: cases.length,
    successfulExecutions: successfulCases.length,
    executionFailures: cases.length - successfulCases.length,
    averageLatencyMs: calculateMean(latencies),
    medianLatencyMs: calculateMedian(latencies),
    meanRecallAt5: calculateMean(
      scores.map(({ metrics }) => metrics.recallAt5),
    ),
    meanRecallAt10: calculateMean(
      scores.map(({ metrics }) => metrics.recallAt10),
    ),
    meanRecallAt15: calculateMean(
      scores.map(({ metrics }) => metrics.recallAt15),
    ),
    meanReciprocalRank: calculateMean(
      scores.map(({ metrics }) => metrics.reciprocalRank),
    ),
    meanNDCGAt5: calculateMean(scores.map(({ metrics }) => metrics.nDCGAt5)),
    meanNDCGAt10: calculateMean(scores.map(({ metrics }) => metrics.nDCGAt10)),
    meanNDCGAt15: calculateMean(scores.map(({ metrics }) => metrics.nDCGAt15)),
    totalRelevantRetrievedAt5: scores.reduce(
      (total, { metrics }) => total + metrics.relevantRetrievedAt5,
      0,
    ),
    totalRelevantTargets: scores.reduce(
      (total, { metrics }) => total + metrics.relevantTotal,
      0,
    ),
    unjudgedRetrieved: scores.reduce(
      (total, { unjudgedRetrieved }) => total + unjudgedRetrieved.length,
      0,
    ),
    missingJudgedTargets: scores.reduce(
      (total, { missingJudgedTargets }) => total + missingJudgedTargets.length,
      0,
    ),
  };
};

const printSummary = (
  dataset: DatasetName,
  summary: RetrievalEvalSummary,
  reportPath: string,
  log: (...values: unknown[]) => void,
) => {
  log(`Retrieval eval: ${dataset}`);
  log(`Cases: ${summary.totalCases}`);
  log(`Execution failures: ${summary.executionFailures}`);
  log(`Mean Recall@5: ${summary.meanRecallAt5 ?? "n/a"}`);
  log(`Mean Recall@10: ${summary.meanRecallAt10 ?? "n/a"}`);
  log(`Mean Recall@15: ${summary.meanRecallAt15 ?? "n/a"}`);
  log(`Mean Reciprocal Rank: ${summary.meanReciprocalRank ?? "n/a"}`);
  log(`Mean nDCG@5: ${summary.meanNDCGAt5 ?? "n/a"}`);
  log(`Mean nDCG@10: ${summary.meanNDCGAt10 ?? "n/a"}`);
  log(`Mean nDCG@15: ${summary.meanNDCGAt15 ?? "n/a"}`);
  log(`Unjudged retrieved: ${summary.unjudgedRetrieved}`);
  log(`Missing judged targets: ${summary.missingJudgedTargets}`);
  log(`Report: ${reportPath}`);
};

const runRetrievalEval = async ({
  retrievalName,
  dataset,
  datasetConfig,
  reportMetadata,
  dependencies,
}: RunRetrievalEvalOptions) => {
  const [testCases, corpus] = await Promise.all([
    dependencies.loadCases(datasetConfig.casesPath),
    dependencies.loadCorpus(datasetConfig.corpusPath),
  ]);
  validateCorpusReferences(testCases, corpus);
  const caseResults: RetrievalEvalCaseResult[] = [];

  for (const testCase of testCases) {
    const result = await runCase(testCase, corpus, dependencies, retrievalName);
    caseResults.push(result);
    dependencies.log(
      `${result.status === "PASS" ? "✓" : "✗"} [${retrievalName}] ${result.caseId} ${result.status}`,
    );
    if (result.status === "EXECUTION_FAILURE")
      dependencies.log(`  ${result.error}`);
  }

  const summary = calculateSummary(caseResults);
  const timestamp = dependencies.getTimestamp();
  const retrievalReportDirectory = `${datasetConfig.reportDirectory}/${retrievalName}`;
  const reportPath = `${retrievalReportDirectory}/run-${timestamp.replace(/[.:]/g, "-")}.json`;
  const report = {
    metadata: {
      timestamp,
      dataset,
      retrievalName,
      latencyScope: "all_attempted_calls",
      gitCommit: dependencies.getGitCommit(),
      ...reportMetadata,
    },
    summary,
    cases: caseResults,
  };

  await dependencies.createReportDirectory(retrievalReportDirectory);
  await dependencies.writeReport(reportPath, report);
  printSummary(dataset, summary, reportPath, dependencies.log);
  return { reportPath, report, summary, cases: caseResults };
};

export type {
  DatasetConfig,
  DatasetName,
  RetrievalEvalCaseResult,
  RetrievalEvalRunnerDependencies,
  RetrievalEvalSummary,
  RunRetrievalEvalOptions,
};

export {
  calculateSummary,
  getSourceQuestion,
  runCase,
  runRetrievalEval,
  validateCorpusReferences,
};
