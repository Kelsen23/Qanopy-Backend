import { describe, expect, it, vi } from "vitest";

import type {
  RetrievalCandidate,
  RetrievalInput,
} from "../../../../src/services/question/similarQuestions/retrieval/retrieval.types.js";

import {
  calculateSummary,
  runCase,
  runRetrievalEval,
  validateCorpusReferences,
} from "../../../../evals/similarQuestionsRetrieval/runner.js";
import type {
  RetrievalCorpus,
  RetrievalEvalCase,
} from "../../../../evals/similarQuestionsRetrieval/schema.js";

const testCase: RetrievalEvalCase = {
  id: "case-1",
  description: "Fixture retrieval case",
  source: { questionId: "source", version: 1 },
  relevant: [{ questionId: "target", version: 1, grade: 3 }],
  tags: ["fixture"],
};

const corpus: RetrievalCorpus = [
  {
    questionId: "source",
    version: 1,
    title: "Source title",
    body: "Source body",
    tags: ["TYPESCRIPT"],
  },
  {
    questionId: "target",
    version: 1,
    title: "Target title",
    body: "Target body",
    tags: ["TYPESCRIPT"],
  },
];

const candidate: RetrievalCandidate = {
  questionId: "target",
  version: 1,
  score: 0.9,
  retrievalVersion: "dense-v1",
  model: "fixture-model",
  representationVersion: "dense-v1",
};

describe("similarQuestions retrieval eval runner", () => {
  it("resolves the source from the corpus and passes its representation to retrieval", async () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(35);
    const retrieve = vi.fn(async () => [candidate]);

    const result = await runCase(
      testCase,
      corpus,
      { retrieve, now },
      "fixture-retriever",
    );

    expect(retrieve).toHaveBeenCalledWith({
      sourceQuestionId: "source",
      sourceVersion: 1,
      title: "Source title",
      body: "Source body",
      tags: ["TYPESCRIPT"],
      limit: 50,
    });
    expect(result).toMatchObject({
      retrievalName: "fixture-retriever",
      caseId: "case-1",
      status: "PASS",
      actual: [candidate],
      latencyMs: 25,
    });
    expect(result.score?.metrics.reciprocalRank).toBe(1);
  });

  it("turns missing sources into execution failures without invoking retrieval", async () => {
    const retrieve = vi.fn(async () => [candidate]);

    const result = await runCase(
      testCase,
      [],
      { retrieve, now: () => 10 },
      "fixture-retriever",
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(result.status).toBe("EXECUTION_FAILURE");
    expect(result.error).toContain("missing from retrieval corpus");
  });

  it("continues after retrieval execution failures and writes a report", async () => {
    const cases = [testCase, { ...testCase, id: "case-2" }];
    const writeReport = vi.fn(async () => undefined);
    const retrieve = vi
      .fn<(input: RetrievalInput) => Promise<RetrievalCandidate[]>>()
      .mockResolvedValueOnce([candidate])
      .mockRejectedValueOnce(new Error("database unavailable"));
    const dependencies = {
      loadCases: vi.fn(async () => cases),
      loadCorpus: vi.fn(async () => corpus),
      retrieve,
      now: () => 10,
      getTimestamp: () => "2026-01-01T00:00:00.000Z",
      getGitCommit: () => "fixture-commit",
      writeReport,
      createReportDirectory: vi.fn(async () => undefined),
      log: vi.fn(),
    };

    const result = await runRetrievalEval({
      retrievalName: "fixture-retriever",
      dataset: "dev",
      datasetConfig: {
        casesPath: "/fixtures/cases.jsonl",
        corpusPath: "/fixtures/corpus.jsonl",
        reportDirectory: "/fixtures/reports",
      },
      dependencies,
    });

    expect(result.cases.map(({ status }) => status)).toEqual([
      "PASS",
      "EXECUTION_FAILURE",
    ]);
    expect(result.cases[1]?.error).toBe("database unavailable");
    expect(dependencies.createReportDirectory).toHaveBeenCalledWith(
      "/fixtures/reports/fixture-retriever",
    );
    expect(writeReport).toHaveBeenCalledWith(
      "/fixtures/reports/fixture-retriever/run-2026-01-01T00-00-00-000Z.json",
      expect.objectContaining({
        metadata: expect.objectContaining({
          retrievalName: "fixture-retriever",
        }),
        cases: result.cases,
      }),
    );
  });

  it("calculates aggregate metrics only from successful cases", () => {
    const summary = calculateSummary([
      {
        retrievalName: "fixture-retriever",
        caseId: "pass",
        description: "pass",
        tags: [],
        status: "PASS",
        source: testCase.source,
        actual: [candidate],
        score: {
          caseId: "pass",
          description: "pass",
          tags: [],
          source: testCase.source,
          relevance: testCase.relevant,
          actual: [],
          missingJudgedTargets: [],
          unjudgedRetrieved: [],
          metrics: {
            recallAt5: 1,
            recallAt10: 1,
            recallAt15: 1,
            nDCGAt5: 1,
            nDCGAt10: 1,
            nDCGAt15: 1,
            reciprocalRank: 1,
            relevantRetrievedAt5: 1,
            relevantTotal: 1,
          },
        },
        latencyMs: 10,
      },
      {
        retrievalName: "fixture-retriever",
        caseId: "failure",
        description: "failure",
        tags: [],
        status: "EXECUTION_FAILURE",
        source: testCase.source,
        actual: [],
        error: "failed",
        latencyMs: 30,
      },
    ]);

    expect(summary).toMatchObject({
      totalCases: 2,
      successfulExecutions: 1,
      executionFailures: 1,
      averageLatencyMs: 20,
      medianLatencyMs: 20,
      meanRecallAt5: 1,
      meanNDCGAt5: 1,
      meanReciprocalRank: 1,
      totalRelevantTargets: 1,
    });
  });

  it("rejects judged references missing from the corpus before execution", () => {
    expect(() => validateCorpusReferences([testCase], corpus)).not.toThrow();

    expect(() =>
      validateCorpusReferences(
        [
          {
            ...testCase,
            relevant: [{ questionId: "missing", version: 1, grade: 3 }],
          },
        ],
        corpus,
      ),
    ).toThrow("references question/version missing from corpus");
  });
});
