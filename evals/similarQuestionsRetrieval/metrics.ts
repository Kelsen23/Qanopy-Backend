const MIN_RELEVANT_GRADE = 2;
const retrievalMetricKs = [5, 10, 15] as const;

const recallAtK = (
  rankedGrades: number[],
  totalRelevant: number,
  k: number,
) => {
  if (totalRelevant === 0) return 0;

  const retrievedRelevant = rankedGrades
    .slice(0, k)
    .filter((grade) => grade >= MIN_RELEVANT_GRADE).length;

  return retrievedRelevant / totalRelevant;
};

const reciprocalRank = (rankedGrades: number[]) => {
  const firstRelevantIndex = rankedGrades.findIndex(
    (grade) => grade >= MIN_RELEVANT_GRADE,
  );

  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
};

const relevanceGain = (grade: number) => 2 ** grade - 1;

const discountedCumulativeGain = (grades: number[], k: number) =>
  grades
    .slice(0, k)
    .reduce(
      (total, grade, index) =>
        total + relevanceGain(grade) / Math.log2(index + 2),
      0,
    );

const nDCGAtK = (
  rankedGrades: number[],
  knownRelevanceGrades: number[],
  k: number,
) => {
  const idealDcg = discountedCumulativeGain(
    [...knownRelevanceGrades].sort((left, right) => right - left),
    k,
  );

  if (idealDcg === 0) return 0;

  return discountedCumulativeGain(rankedGrades, k) / idealDcg;
};

export {
  discountedCumulativeGain,
  MIN_RELEVANT_GRADE,
  nDCGAtK,
  recallAtK,
  relevanceGain,
  reciprocalRank,
  retrievalMetricKs,
};
