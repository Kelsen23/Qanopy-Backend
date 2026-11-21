import { describe, expect, it } from "vitest";

import {
  discountedCumulativeGain,
  nDCGAtK,
  recallAtK,
  relevanceGain,
  reciprocalRank,
} from "../../../../evals/similarQuestionsRetrieval/metrics.js";

describe("retrieval metrics", () => {
  it("uses grade 2 as the binary relevance boundary for recall", () => {
    expect(recallAtK([1, 2, 3, 0], 2, 2)).toBe(0.5);
    expect(recallAtK([1, 2, 3, 0], 2, 3)).toBe(1);
  });

  it("returns zero recall when a case has no relevant targets", () => {
    expect(recallAtK([3, 2], 0, 5)).toBe(0);
  });

  it("finds the first binary-relevant result for reciprocal rank", () => {
    expect(reciprocalRank([1, 0, 2, 3])).toBe(1 / 3);
    expect(reciprocalRank([1, 0, 1])).toBe(0);
  });

  it("uses the graded 0-to-3 gain scale", () => {
    expect(relevanceGain(0)).toBe(0);
    expect(relevanceGain(1)).toBe(1);
    expect(relevanceGain(2)).toBe(3);
    expect(relevanceGain(3)).toBe(7);
  });

  it("discounts lower-ranked gains", () => {
    expect(discountedCumulativeGain([3], 1)).toBe(7);
    expect(discountedCumulativeGain([0, 3], 2)).toBeCloseTo(7 / Math.log2(3));
  });

  it("compares the ranked result with the ideal graded ordering", () => {
    expect(nDCGAtK([3, 2, 1], [3, 2, 1], 3)).toBe(1);
    expect(nDCGAtK([1, 2, 3], [3, 2, 1], 3)).toBeCloseTo(
      discountedCumulativeGain([1, 2, 3], 3) /
        discountedCumulativeGain([3, 2, 1], 3),
    );
  });

  it("applies the cutoff to both actual and ideal rankings", () => {
    expect(nDCGAtK([0, 3], [3, 2], 1)).toBe(0);
    expect(nDCGAtK([3, 0], [3, 2], 1)).toBe(1);
  });

  it("returns zero nDCG when the ideal ranking has no gain", () => {
    expect(nDCGAtK([0, 0], [], 5)).toBe(0);
  });
});
