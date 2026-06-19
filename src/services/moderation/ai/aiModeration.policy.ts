type ModerationDecision = "IGNORE" | "WARN" | "BAN_TEMP" | "BAN_PERM";

type AiModerationPolicyResult = {
  flagged: boolean;
  confidence: number;
  severity: number;
  reasons: string[];
  categoryScores: Record<string, number>;
  primaryCategory: string | null;
  recommendedAction: ModerationDecision;
};

const HIGH_RISK_CATEGORIES = new Set([
  "sexual/minors",
  "violence/graphic",
  "self-harm/graphic",
  "self-harm/instructions",
]);

const TEMP_BAN_CATEGORIES = new Set([
  "hate/threatening",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
]);

const WARN_CATEGORIES = new Set(["hate", "harassment", "sexual", "violence"]);

const normalizeScore = (score: number) => Math.max(0, Math.min(1, score));

const getPrimaryCategory = (categoryScores: Record<string, number>) => {
  let primaryCategory: string | null = null;
  let topScore = 0;

  for (const [category, score] of Object.entries(categoryScores)) {
    const normalizedScore = normalizeScore(Number(score) || 0);

    if (normalizedScore >= topScore) {
      topScore = normalizedScore;
      primaryCategory = category;
    }
  }

  return { primaryCategory, topScore };
};

const determineRecommendedAction = (
  primaryCategory: string | null,
  topScore: number,
  flagged: boolean,
): ModerationDecision => {
  if (!flagged) return "IGNORE";

  if (!primaryCategory) return "WARN";

  if (HIGH_RISK_CATEGORIES.has(primaryCategory)) {
    return topScore >= 0.55 ? "BAN_PERM" : "BAN_TEMP";
  }

  if (TEMP_BAN_CATEGORIES.has(primaryCategory)) {
    return topScore >= 0.65 ? "BAN_TEMP" : "WARN";
  }

  if (WARN_CATEGORIES.has(primaryCategory)) {
    return topScore >= 0.35 ? "WARN" : "IGNORE";
  }

  return topScore >= 0.25 ? "WARN" : "IGNORE";
};

const buildModerationReasons = (
  primaryCategory: string | null,
  topScore: number,
  flagged: boolean,
) => {
  if (!flagged) {
    return ["No violations detected"];
  }

  if (!primaryCategory) {
    return ["Flagged but unclear"];
  }

  if (HIGH_RISK_CATEGORIES.has(primaryCategory)) {
    return [
      `High-risk content detected: ${primaryCategory}`,
      `Confidence ${(topScore * 100).toFixed(1)}%`,
    ];
  }

  if (TEMP_BAN_CATEGORIES.has(primaryCategory)) {
    return [
      `Serious content detected: ${primaryCategory}`,
      `Confidence ${(topScore * 100).toFixed(1)}%`,
    ];
  }

  if (WARN_CATEGORIES.has(primaryCategory)) {
    return [
      `Potential guideline violation: ${primaryCategory}`,
      `Confidence ${(topScore * 100).toFixed(1)}%`,
    ];
  }

  return [
    `Flagged content category: ${primaryCategory}`,
    `Confidence ${(topScore * 100).toFixed(1)}%`,
  ];
};

const buildAiModerationPolicy = (rawResult: {
  flagged: boolean;
  category_scores?: Record<string, number>;
}) => {
  const categoryScores = Object.fromEntries(
    Object.entries(rawResult.category_scores ?? {}).map(([category, score]) => [
      category,
      normalizeScore(Number(score) || 0),
    ]),
  );

  const { primaryCategory, topScore } = getPrimaryCategory(categoryScores);
  const flagged = Boolean(rawResult.flagged);
  const confidence = flagged ? topScore : 1;
  const recommendedAction = determineRecommendedAction(
    primaryCategory,
    topScore,
    flagged,
  );
  const reasons = buildModerationReasons(primaryCategory, topScore, flagged);

  const severity = !flagged
    ? 0
    : primaryCategory && HIGH_RISK_CATEGORIES.has(primaryCategory)
      ? Math.min(100, Math.round(topScore * 120))
      : primaryCategory && TEMP_BAN_CATEGORIES.has(primaryCategory)
        ? Math.min(100, Math.round(topScore * 110))
        : primaryCategory && WARN_CATEGORIES.has(primaryCategory)
          ? Math.min(100, Math.round(topScore * 100))
          : 45;

  return {
    flagged,
    confidence,
    severity,
    reasons,
    categoryScores,
    primaryCategory,
    recommendedAction,
  } satisfies AiModerationPolicyResult;
};

export type { AiModerationPolicyResult, ModerationDecision };

export { buildAiModerationPolicy };
