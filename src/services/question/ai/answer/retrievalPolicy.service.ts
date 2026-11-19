import type { GenerationPlan } from "../../../../validations/question/aiAnswer/generationPlan.schema.js";

import aiAnswerRetrievalLimits from "../../../../config/aiAnswerRetrieval.config.js";

import { GenerationPlanSchema } from "../../../../validations/question/aiAnswer/generationPlan.schema.js";

type RetrievalSourceType = GenerationPlan["retrievalSources"][number]["type"];
type RetrievalUsage = {
  totalCalls: number;
  totalEvidenceTokens: number;
  sources: Partial<
    Record<RetrievalSourceType, { calls: number; evidenceTokens: number }>
  >;
};

const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

const validateRetrievalUsage = (usage: RetrievalUsage) => {
  const sourceUsage = Object.values(usage.sources);

  const hasInvalidCount =
    !validCount(usage.totalCalls) ||
    !validCount(usage.totalEvidenceTokens) ||
    sourceUsage.some(
      (source) =>
        source &&
        (!validCount(source.calls) || !validCount(source.evidenceTokens)),
    );

  const countedCalls = sourceUsage.reduce(
    (total, source) => total + (source?.calls ?? 0),
    0,
  );
  const countedEvidenceTokens = sourceUsage.reduce(
    (total, source) => total + (source?.evidenceTokens ?? 0),
    0,
  );

  if (
    hasInvalidCount ||
    countedCalls > usage.totalCalls ||
    countedEvidenceTokens > usage.totalEvidenceTokens
  ) {
    throw new Error("Invalid retrieval usage counters");
  }
};

const getRetrievalAllowance = (
  persistedPlan: unknown,
  sourceType: RetrievalSourceType,
  usage: RetrievalUsage,
) => {
  const plan = GenerationPlanSchema.parse(persistedPlan);

  validateRetrievalUsage(usage);

  const source = plan.retrievalSources.find(({ type }) => type === sourceType);
  if (!source)
    throw new Error(`Retrieval source ${sourceType} is not authorized`);

  const sourceUsage = usage.sources[sourceType] ?? {
    calls: 0,
    evidenceTokens: 0,
  };
  const sourceLimits = aiAnswerRetrievalLimits.sources[sourceType];

  const remainingCalls = Math.min(
    source.maxCalls - sourceUsage.calls,
    sourceLimits.maxCalls - sourceUsage.calls,
    plan.maxTotalToolCalls - usage.totalCalls,
    aiAnswerRetrievalLimits.maxTotalToolCalls - usage.totalCalls,
  );

  const remainingEvidenceTokens = Math.min(
    source.maxEvidenceTokens - sourceUsage.evidenceTokens,
    sourceLimits.maxEvidenceTokens - sourceUsage.evidenceTokens,
    plan.maxTotalEvidenceTokens - usage.totalEvidenceTokens,
    aiAnswerRetrievalLimits.maxTotalEvidenceTokens - usage.totalEvidenceTokens,
  );

  if (remainingCalls <= 0) throw new Error("Retrieval call budget exhausted");
  if (remainingEvidenceTokens <= 0)
    throw new Error("Retrieval evidence budget exhausted");

  return { remainingCalls, remainingEvidenceTokens };
};

export { getRetrievalAllowance };
export type { RetrievalSourceType, RetrievalUsage };
