import type { CreditOperationType } from "../../../generated/prisma/client.js";
import type {
  GenerationPlan,
  GenerationPlanMetadata,
} from "../../../validations/aiAnswer/generationPlan.schema.js";

import prisma from "../../../config/prisma.config.js";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const getBaseCharge = (type: CreditOperationType) => {
  switch (type) {
    case "AI_SUGGESTION":
      return 25;
    case "AI_ANSWER":
      return 80;
  }
};

const getReputationMultiplier = (reputationPoints: number) => {
  if (reputationPoints >= 1000) return 0.85;
  if (reputationPoints >= 250) return 0.9;
  if (reputationPoints >= 50) return 1;
  if (reputationPoints >= 10) return 1.1;
  return 1.2;
};

export const AI_ANSWER_PRICING_POLICY = {
  version: "ai-answer-pricing-v2",
  baselineCredits: 40,
  baselineContextTokens: 16000,
  baselineOutputTokens: 2000,
  modelTierMultipliers: {
    BASIC: 0.65,
    STANDARD: 1,
    ADVANCED: 1.5,
    FRONTIER: 2,
  },
  reasoningEffortMultipliers: { LOW: 0.8, MEDIUM: 1, HIGH: 1.35 },
  retrievalSurcharges: {
    INTERNAL_AI_ANSWERS: 0.1,
    KNOWLEDGE_BASE: 0.2,
    WEB: 0.3,
  },
  minBudgetMultiplier: 0.5,
  maxBudgetMultiplier: 2,
} as const;

const calculateAIAnswerPlanCharge = (
  plan: GenerationPlan,
  metadata: GenerationPlanMetadata,
) => {
  const policy = AI_ANSWER_PRICING_POLICY;
  const budgetMultiplier = clamp(
    Math.sqrt(
      (metadata.maxContextTokens / policy.baselineContextTokens) *
        (metadata.maxOutputTokens / policy.baselineOutputTokens),
    ),
    policy.minBudgetMultiplier,
    policy.maxBudgetMultiplier,
  );
  const retrievalMultiplier =
    1 +
    plan.retrievalSources.reduce(
      (total, source) => total + policy.retrievalSurcharges[source.type],
      0,
    );

  return {
    amount: Math.ceil(
      policy.baselineCredits *
        policy.modelTierMultipliers[plan.modelTier] *
        policy.reasoningEffortMultipliers[plan.reasoningEffort] *
        budgetMultiplier *
        retrievalMultiplier,
    ),
    pricingPolicyVersion: policy.version,
  };
};

const calculateCreditCharge = async (
  input:
    | {
        type: "AI_ANSWER";
        plan: GenerationPlan;
        metadata: GenerationPlanMetadata;
      }
    | { userId: string; type: CreditOperationType; content: string },
): Promise<number> => {
  if ("plan" in input) {
    return calculateAIAnswerPlanCharge(input.plan, input.metadata).amount;
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      stats: { select: { reputationPoints: true } },
      moderationStats: {
        select: {
          trustScore: true,
          totalStrikes: true,
          flaggedCount: true,
          rejectedCount: true,
        },
      },
    },
  });

  const reputationPoints = user?.stats?.reputationPoints ?? 0;
  const moderationStats = user?.moderationStats;
  const fixedOverhead = input.type === "AI_ANSWER" ? 3600 : 800;
  const estimatedTokens = estimateTokens(input.content) + fixedOverhead;
  const contentMultiplier = clamp(1 + estimatedTokens / 6000, 1, 1.5);
  const reputationMultiplier = getReputationMultiplier(reputationPoints);
  const trustScore = moderationStats?.trustScore ?? 1;
  const moderationMultiplier = clamp(
    1 +
      (1 - trustScore) * 0.4 +
      Math.min(moderationStats?.totalStrikes ?? 0, 5) * 0.06 +
      Math.min(moderationStats?.flaggedCount ?? 0, 10) * 0.015 +
      Math.min(moderationStats?.rejectedCount ?? 0, 5) * 0.04,
    1,
    1.75,
  );

  return Math.ceil(
    getBaseCharge(input.type) *
      contentMultiplier *
      reputationMultiplier *
      moderationMultiplier,
  );
};

export default calculateCreditCharge;
