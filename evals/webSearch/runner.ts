import type { LLMMetadata } from "../../src/services/llmGateway/llmGateway.types.js";
import type { WebSearchAdapterResult } from "../../src/validations/question/aiAnswer/webSearch.schema.js";

import type {
  WebSearchEvalCase,
  WebSearchEvalEvidence,
  WebSearchEvalJudgeResult,
} from "./schema.js";
import type { WebSearchCaseScore } from "./score.js";

type DatasetName = "dev" | "holdout" | "regression";

type DatasetConfig = {
  path: string;
  reportDirectory: string;
};

type WebSearchEvalCaseResult = {
  caseId: string;
  description: string;
  scenarioTags: string[];
  query: string;
  status: "PASS" | "EXECUTION_FAILURE" | "JUDGE_FAILURE" | "SCORING_FAILURE";
  evidence: WebSearchEvalEvidence[] | null;
  score?: WebSearchCaseScore;
  executionError?: string;
  judgeError?: string;
  scoringError?: string;
  retrievalLatencyMs: number;
  evidenceTokensUsed?: number;
  searchStatus?: WebSearchAdapterResult["status"];
};

type WebSearchEvalSummary = {
  totalCases: number;
  successfulCases: number;
  executionFailures: number;
  judgeFailures: number;
  scoringFailures: number;
  meanPrecisionAt5: number | null;
  meanNdcgAt5: number | null;
  meanAuthorityGrade: number | null;
  meanAuthorityGradeAt5: number | null;
  meanReferenceFactCoverage: number | null;
  meanCriticalFactCoverage: number | null;
  meanUniqueSourcesReturned: number | null;
  averageRetrievalLatencyMs: number | null;
  medianRetrievalLatencyMs: number | null;
  p95RetrievalLatencyMs: number | null;
  totalEvidenceTokensUsed: number;
  providerRequests: number;
  providerRetries: number;
  searchOutcomeCounts: Record<WebSearchAdapterResult["status"], number>;
  missingRequiredPassageEvidence: number;
};

type WebSearchJudgeExecution = {
  result: { judgments: WebSearchEvalJudgeResult[] };
  metadata: LLMMetadata;
};

type WebSearchEvalRunnerDependencies = {
  loadCases: (filename: string) => Promise<WebSearchEvalCase[]>;
  executeSearch: (input: {
    input: WebSearchEvalCase["input"];
    remainingEvidenceTokens: number;
  }) => Promise<WebSearchAdapterResult>;
  judgeCases: (input: {
    items: Array<{
      caseId: string;
      query: string;
      referenceFacts: WebSearchEvalCase["assertions"]["referenceFacts"];
      results: Array<WebSearchEvalEvidence & { rank: number }>;
    }>;
  }) => Promise<WebSearchJudgeExecution>;
  scoreCase: (
    testCase: WebSearchEvalCase,
    evidence: WebSearchEvalEvidence[],
    judgment: WebSearchEvalJudgeResult,
  ) => WebSearchCaseScore;
  now: () => number;
  getTimestamp: () => string;
  getGitCommit: () => string | undefined;
  writeReport: (filename: string, report: unknown) => Promise<void>;
  createReportDirectory: (directory: string) => Promise<void>;
  getDatasetHash: (filename: string) => Promise<string>;
  log: (...values: unknown[]) => void;
};

type RunWebSearchEvalOptions = {
  dataset: DatasetName;
  datasetConfig: DatasetConfig;
  dependencies: WebSearchEvalRunnerDependencies;
  judgeProvider: string;
  judgeModel: string;
  evidenceTokenBudget?: number;
  batchSize?: number;
  caseId?: string;
};

type WebSearchCaseState = {
  testCase: WebSearchEvalCase;
  evidence: WebSearchEvalEvidence[] | null;
  retrievalLatencyMs: number;
  evidenceTokensUsed: number;
  searchStatus?: WebSearchAdapterResult["status"];
  result?: WebSearchEvalCaseResult;
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
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const calculatePercentile = (values: number[], percentile: number) => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentile * sorted.length) - 1;

  return sorted[Math.max(0, index)] ?? null;
};

const calculateSummary = (
  cases: WebSearchEvalCaseResult[],
): WebSearchEvalSummary => {
  const successful = cases.filter(({ status }) => status === "PASS");
  const scores = successful.flatMap(({ score }) => (score ? [score] : []));
  const retrievalLatencies = cases.map(
    ({ retrievalLatencyMs }) => retrievalLatencyMs,
  );

  const outcomeStatuses: WebSearchAdapterResult["status"][] = [
    "SEARCH_COMPLETE",
    "NO_RESULTS",
    "BUDGET_EXHAUSTED",
    "INVALID_ARGUMENTS",
    "PROVIDER_RESPONSE_INVALID",
    "PROVIDER_TIMEOUT",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_REQUEST_REJECTED",
    "RATE_LIMITED",
    "SERVICE_UNAVAILABLE",
  ];

  const searchOutcomeCounts = Object.fromEntries(
    outcomeStatuses.map((status) => [
      status,
      cases.filter(({ searchStatus }) => searchStatus === status).length,
    ]),
  ) as Record<WebSearchAdapterResult["status"], number>;

  return {
    totalCases: cases.length,
    successfulCases: successful.length,
    executionFailures: cases.filter(
      ({ status }) => status === "EXECUTION_FAILURE",
    ).length,
    judgeFailures: cases.filter(({ status }) => status === "JUDGE_FAILURE")
      .length,
    scoringFailures: cases.filter(({ status }) => status === "SCORING_FAILURE")
      .length,
    meanPrecisionAt5: calculateMean(
      scores.map(({ metrics }) => metrics.precisionAt5),
    ),
    meanNdcgAt5: calculateMean(scores.map(({ metrics }) => metrics.nDCGAt5)),
    meanAuthorityGrade: calculateMean(
      scores.map(({ metrics }) => metrics.meanAuthorityGrade),
    ),
    meanAuthorityGradeAt5: calculateMean(
      scores.map(({ metrics }) => metrics.meanAuthorityGradeAt5),
    ),
    meanReferenceFactCoverage: calculateMean(
      scores.map(({ metrics }) => metrics.referenceFactCoverage),
    ),
    meanCriticalFactCoverage: calculateMean(
      scores.flatMap(({ metrics }) =>
        metrics.criticalFactCoverage === null
          ? []
          : [metrics.criticalFactCoverage],
      ),
    ),
    meanUniqueSourcesReturned: calculateMean(
      cases.map(
        ({ evidence }) => new Set(evidence?.map(({ url }) => url) ?? []).size,
      ),
    ),
    averageRetrievalLatencyMs: calculateMean(retrievalLatencies),
    medianRetrievalLatencyMs: calculateMedian(retrievalLatencies),
    p95RetrievalLatencyMs: calculatePercentile(retrievalLatencies, 0.95),
    totalEvidenceTokensUsed: cases.reduce(
      (total, result) => total + (result.evidenceTokensUsed ?? 0),
      0,
    ),
    providerRequests: cases.filter(
      ({ searchStatus }) =>
        searchStatus !== undefined &&
        searchStatus !== "INVALID_ARGUMENTS" &&
        searchStatus !== "BUDGET_EXHAUSTED" &&
        searchStatus !== "RATE_LIMITED" &&
        searchStatus !== "SERVICE_UNAVAILABLE",
    ).length,
    providerRetries: 0,
    searchOutcomeCounts,
    missingRequiredPassageEvidence: scores.filter(
      ({ missingRequiredPassageEvidence }) => missingRequiredPassageEvidence,
    ).length,
  };
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const runWebSearchEval = async ({
  dataset,
  datasetConfig,
  dependencies,
  judgeProvider,
  judgeModel,
  evidenceTokenBudget = 4_000,
  batchSize = 1,
  caseId,
}: RunWebSearchEvalOptions) => {
  if (!Number.isSafeInteger(evidenceTokenBudget) || evidenceTokenBudget < 1) {
    throw new Error("Web search eval evidence-token budget must be positive");
  }

  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("Web search eval batch size must be a positive integer");
  }

  const loadedCases = await dependencies.loadCases(datasetConfig.path);
  const testCases = caseId
    ? loadedCases.filter((testCase) => testCase.id === caseId)
    : loadedCases;

  if (caseId && testCases.length === 0) {
    throw new Error(`Web search eval case was not found: ${caseId}`);
  }

  const states: WebSearchCaseState[] = [];

  dependencies.log(`Running Brave searches for ${testCases.length} cases`);

  for (const [index, testCase] of testCases.entries()) {
    const startedAt = dependencies.now();
    dependencies.log(
      `[search ${index + 1}/${testCases.length}] ${testCase.id}`,
    );

    try {
      const execution = await dependencies.executeSearch({
        input: testCase.input,
        remainingEvidenceTokens: evidenceTokenBudget,
      });

      if (execution.status === "NO_RESULTS") {
        states.push({
          testCase,
          evidence: [],
          retrievalLatencyMs: dependencies.now() - startedAt,
          evidenceTokensUsed: 0,
          searchStatus: execution.status,
        });

        dependencies.log("  search returned no results");

        continue;
      }

      if (execution.status !== "SEARCH_COMPLETE") {
        states.push({
          testCase,
          evidence: null,
          retrievalLatencyMs: dependencies.now() - startedAt,
          evidenceTokensUsed: 0,
          searchStatus: execution.status,
          result: {
            caseId: testCase.id,
            description: testCase.description,
            scenarioTags: testCase.scenarioTags,
            query: testCase.input.query,
            status: "EXECUTION_FAILURE",
            evidence: null,
            executionError: execution.message,
            retrievalLatencyMs: dependencies.now() - startedAt,
            evidenceTokensUsed: 0,
            searchStatus: execution.status,
          },
        });

        dependencies.log(`  search returned ${execution.status}`);

        continue;
      }

      states.push({
        testCase,
        evidence: execution.evidence,
        retrievalLatencyMs: dependencies.now() - startedAt,
        evidenceTokensUsed: execution.evidenceTokensUsed,
        searchStatus: execution.status,
      });

      dependencies.log(
        `  retrieved ${execution.evidence.length} source results in ${Math.round(dependencies.now() - startedAt)}ms`,
      );
    } catch (error) {
      states.push({
        testCase,
        evidence: null,
        retrievalLatencyMs: dependencies.now() - startedAt,
        evidenceTokensUsed: 0,
        result: {
          caseId: testCase.id,
          description: testCase.description,
          scenarioTags: testCase.scenarioTags,
          query: testCase.input.query,
          status: "EXECUTION_FAILURE",
          evidence: null,
          executionError: errorMessage(error),
          retrievalLatencyMs: dependencies.now() - startedAt,
          evidenceTokensUsed: 0,
        },
      });
      dependencies.log(`  search failed: ${errorMessage(error)}`);
    }
  }

  const noResultStates = states.filter(
    (state) => state.searchStatus === "NO_RESULTS",
  );

  for (const state of noResultStates) {
    try {
      const score = dependencies.scoreCase(state.testCase, [], {
        caseId: state.testCase.id,
        resultJudgments: [],
        unsupportedFactIds: [],
      });

      state.result = {
        caseId: state.testCase.id,
        description: state.testCase.description,
        scenarioTags: state.testCase.scenarioTags,
        query: state.testCase.input.query,
        status: "PASS",
        evidence: [],
        score,
        retrievalLatencyMs: state.retrievalLatencyMs,
        evidenceTokensUsed: state.evidenceTokensUsed,
        searchStatus: state.searchStatus,
      };
    } catch (error) {
      state.result = {
        caseId: state.testCase.id,
        description: state.testCase.description,
        scenarioTags: state.testCase.scenarioTags,
        query: state.testCase.input.query,
        status: "SCORING_FAILURE",
        evidence: [],
        scoringError: errorMessage(error),
        retrievalLatencyMs: state.retrievalLatencyMs,
        evidenceTokensUsed: state.evidenceTokensUsed,
        searchStatus: state.searchStatus,
      };
    }
  }

  const judgeableStates = states.filter(
    (
      state,
    ): state is WebSearchCaseState & { evidence: WebSearchEvalEvidence[] } =>
      state.evidence !== null && state.searchStatus !== "NO_RESULTS",
  );

  const totalJudgeBatches = Math.ceil(judgeableStates.length / batchSize);

  dependencies.log(
    `Judging ${judgeableStates.length} successful searches in ${totalJudgeBatches} batches`,
  );

  for (let offset = 0; offset < judgeableStates.length; offset += batchSize) {
    const batch = judgeableStates.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;

    dependencies.log(
      `[judge ${batchNumber}/${totalJudgeBatches}] ${batch.map(({ testCase }) => testCase.id).join(", ")}`,
    );

    let judgmentByCaseId: Map<string, WebSearchEvalJudgeResult>;

    try {
      const execution = await dependencies.judgeCases({
        items: batch.map(({ testCase, evidence }) => ({
          caseId: testCase.id,
          query: testCase.input.query,
          referenceFacts: testCase.assertions.referenceFacts,
          results: evidence.map((result, index) => ({
            ...result,
            rank: index + 1,
          })),
        })),
      });

      judgmentByCaseId = new Map(
        execution.result.judgments.map((judgment) => [
          judgment.caseId,
          judgment,
        ]),
      );

      const expectedIds = new Set(batch.map(({ testCase }) => testCase.id));

      if (
        judgmentByCaseId.size !== batch.length ||
        [...expectedIds].some((expectedId) => !judgmentByCaseId.has(expectedId))
      ) {
        throw new Error(
          "Web search eval judge returned an incomplete case batch",
        );
      }

      dependencies.log(`  judge batch completed`);
    } catch (error) {
      for (const state of batch) {
        state.result = {
          caseId: state.testCase.id,
          description: state.testCase.description,
          scenarioTags: state.testCase.scenarioTags,
          query: state.testCase.input.query,
          status: "JUDGE_FAILURE",
          evidence: state.evidence,
          judgeError: errorMessage(error),
          retrievalLatencyMs: state.retrievalLatencyMs,
          evidenceTokensUsed: state.evidenceTokensUsed,
          searchStatus: state.searchStatus,
        };
      }
      continue;
    }

    for (const state of batch) {
      try {
        const judgment = judgmentByCaseId.get(state.testCase.id);

        if (!judgment || !state.evidence) {
          throw new Error(
            `Web search eval judge omitted case ${state.testCase.id}`,
          );
        }

        const score = dependencies.scoreCase(
          state.testCase,
          state.evidence,
          judgment,
        );

        state.result = {
          caseId: state.testCase.id,
          description: state.testCase.description,
          scenarioTags: state.testCase.scenarioTags,
          query: state.testCase.input.query,
          status: "PASS",
          evidence: state.evidence,
          score,
          retrievalLatencyMs: state.retrievalLatencyMs,
          evidenceTokensUsed: state.evidenceTokensUsed,
          searchStatus: state.searchStatus,
        };
      } catch (error) {
        state.result = {
          caseId: state.testCase.id,
          description: state.testCase.description,
          scenarioTags: state.testCase.scenarioTags,
          query: state.testCase.input.query,
          status: "SCORING_FAILURE",
          evidence: state.evidence,
          scoringError: errorMessage(error),
          retrievalLatencyMs: state.retrievalLatencyMs,
          evidenceTokensUsed: state.evidenceTokensUsed,
          searchStatus: state.searchStatus,
        };
      }
    }
  }

  const caseResults = states.map(({ result }) => {
    if (!result) throw new Error("Web search eval result was not created");
    return result;
  });

  for (const result of caseResults) {
    const marker = result.status === "PASS" ? "✓" : "✗";
    dependencies.log(`${marker} ${result.caseId} ${result.status}`);
    if (result.executionError) dependencies.log(`  ${result.executionError}`);
    if (result.judgeError) dependencies.log(`  ${result.judgeError}`);
    if (result.scoringError) dependencies.log(`  ${result.scoringError}`);
  }

  const summary = calculateSummary(caseResults);
  const datasetHash = await dependencies.getDatasetHash(datasetConfig.path);
  const timestamp = dependencies.getTimestamp();
  const reportPath = `${datasetConfig.reportDirectory}/run-${timestamp.replace(/[.:]/g, "-")}.json`;
  const report = {
    metadata: {
      timestamp,
      dataset,
      reportSchemaVersion: 2,
      rankingUnit: "unique_source_url",
      evidenceBudgetEstimator: "characters_divided_by_4",
      sourceAllocationPolicy: "provider_order",
      latencyScope: "adapter_execution_including_rate_limit_and_normalization",
      datasetSha256: datasetHash,
      gitCommit: dependencies.getGitCommit(),
      judgeProvider,
      judgeModel,
      evidenceTokenBudget,
      retryPolicy: "no_internal_retries",
      batchSize,
      caseId: caseId ?? null,
    },
    summary,
    cases: caseResults,
  };

  await dependencies.createReportDirectory(datasetConfig.reportDirectory);
  await dependencies.writeReport(reportPath, report);

  dependencies.log(`Report: ${reportPath}`);
  dependencies.log(`Mean nDCG@5: ${summary.meanNdcgAt5 ?? "n/a"}`);
  dependencies.log(
    `Mean critical fact coverage: ${summary.meanCriticalFactCoverage ?? "n/a"}`,
  );

  return { report, reportPath };
};

export {
  calculatePercentile,
  calculateMedian,
  calculateMean,
  calculateSummary,
  runWebSearchEval,
};

export type {
  DatasetConfig,
  DatasetName,
  RunWebSearchEvalOptions,
  WebSearchEvalCaseResult,
  WebSearchEvalRunnerDependencies,
  WebSearchEvalSummary,
};
