import { describe, expect, it } from "vitest";

import type { RetrievalCandidate } from "../../../../src/services/question/similarQuestions/retrieval/retrieval.types.js";

import { scoreRetrievalCase } from "../../../../evals/similarQuestionsRetrieval/score.js";

const evalCase = {
  id: "case-1",
  description: "Test retrieval case",
  source: { questionId: "source", version: 1 },
  relevant: [
    { questionId: "grade-3", version: 1, grade: 3 as const },
    { questionId: "grade-2", version: 1, grade: 2 as const },
    { questionId: "grade-1", version: 1, grade: 1 as const },
  ],
  tags: ["test"],
};

const candidate = (
  questionId: string,
  score: number,
  version = 1,
): RetrievalCandidate => ({
  questionId,
  version,
  score,
  retrievalVersion: "dense-v1",
  model: "test-model",
  representationVersion: "dense-v1",
});

describe("scoreRetrievalCase", () => {
  it("maps judged results to grades and preserves ranking diagnostics", () => {
    const result = scoreRetrievalCase(evalCase, [
      candidate("grade-3", 0.91),
      candidate("unjudged", 0.88),
      candidate("grade-2", 0.72),
    ]);

    expect(result.actual).toEqual([
      { ...candidate("grade-3", 0.91), rank: 1, relevanceGrade: 3 },
      { ...candidate("unjudged", 0.88), rank: 2, relevanceGrade: 0 },
      { ...candidate("grade-2", 0.72), rank: 3, relevanceGrade: 2 },
    ]);
    expect(result.unjudgedRetrieved).toHaveLength(1);
    expect(result.unjudgedRetrieved[0]?.score).toBe(0.88);
  });

  it("calculates recall, reciprocal rank, and nDCG from grades rather than scores", () => {
    const result = scoreRetrievalCase(evalCase, [
      candidate("unjudged", 0.99),
      candidate("grade-3", 0.01),
      candidate("grade-2", 0.02),
    ]);

    expect(result.metrics).toMatchObject({
      recallAt5: 1,
      recallAt10: 1,
      recallAt15: 1,
      reciprocalRank: 0.5,
      relevantRetrievedAt5: 2,
      relevantTotal: 2,
    });
    expect(result.metrics.nDCGAt5).toBeGreaterThan(0);
  });

  it("reports every judged target that was not retrieved, including grade 1", () => {
    const result = scoreRetrievalCase(evalCase, [candidate("grade-3", 0.9)]);

    expect(result.missingJudgedTargets).toEqual([
      { questionId: "grade-2", version: 1, grade: 2 },
      { questionId: "grade-1", version: 1, grade: 1 },
    ]);
  });

  it("distinguishes question versions when assigning judgments", () => {
    const versionedCase = {
      ...evalCase,
      relevant: [{ questionId: "target", version: 2, grade: 3 as const }],
    };
    const result = scoreRetrievalCase(versionedCase, [
      candidate("target", 0.9, 1),
      candidate("target", 0.8, 2),
    ]);

    expect(result.actual.map(({ relevanceGrade }) => relevanceGrade)).toEqual([
      0, 3,
    ]);
  });

  it("rejects duplicate question/version candidates", () => {
    expect(() =>
      scoreRetrievalCase(evalCase, [
        candidate("grade-3", 0.9),
        candidate("grade-3", 0.8),
      ]),
    ).toThrow("duplicate candidate");
  });

  it("rejects the source question/version in the result", () => {
    expect(() =>
      scoreRetrievalCase(evalCase, [candidate("source", 0.9)]),
    ).toThrow("source question/version");
  });

  it("allows the same question ID when the version differs from the source", () => {
    expect(() =>
      scoreRetrievalCase(evalCase, [candidate("source", 0.9, 2)]),
    ).not.toThrow();
  });
});
