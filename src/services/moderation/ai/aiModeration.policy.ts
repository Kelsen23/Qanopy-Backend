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

const HIGH_RISK_TEMP_BAN_MIN_SCORE = 0.5;
const HIGH_RISK_PERM_BAN_MIN_SCORE = 0.55;

const TEMP_BAN_CATEGORIES = new Set([
  "hate/threatening",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
]);

const WARN_CATEGORIES = new Set(["hate", "harassment", "sexual", "violence"]);

const CATEGORY_REASON_MAP: Record<string, string[]> = {
  "sexual/minors": [
    "Your content appears to contain sexual material involving a minor or someone who may be underage.",
    "Any sexual content involving minors is strictly prohibited and results in immediate enforcement action.",
  ],

  "violence/graphic": [
    "Your content appears to contain graphic depictions of serious injury, gore, or extreme violence.",
    "Graphic violent material is not permitted because it may be disturbing or harmful to other users.",
  ],

  "self-harm/graphic": [
    "Your content appears to contain graphic depictions of self-harm, injury, or suicide.",
    "Graphic self-harm content is not allowed due to the risk of harm and distress it may cause.",
  ],

  "self-harm/instructions": [
    "Your content appears to provide instructions, methods, or guidance related to self-harm.",
    "Content that promotes, facilitates, or teaches self-harm is strictly prohibited.",
  ],

  "hate/threatening": [
    "Your content appears to contain hateful language combined with threats, intimidation, or calls for harm toward a protected group.",
    "Threats, incitement, or advocacy of violence against protected groups are not allowed.",
  ],

  "harassment/threatening": [
    "Your content appears to contain targeted threats, intimidation, or severe harassment directed at another individual.",
    "Threatening or abusive behavior toward others is prohibited.",
  ],

  "self-harm": [
    "Your content appears to promote, encourage, glorify, or normalize self-harm.",
    "Content that encourages self-harming behavior is not allowed on the platform.",
  ],

  "self-harm/intent": [
    "Your content appears to express an intention or desire to engage in self-harm.",
    "Statements indicating self-harm intent are treated as serious safety concerns and may require additional review.",
  ],

  hate: [
    "Your content appears to contain hateful, degrading, or discriminatory language targeting people based on protected characteristics.",
    "Content that attacks, demeans, or promotes hatred toward protected groups is not allowed.",
  ],

  harassment: [
    "Your content appears to contain insults, abusive language, or targeted harassment directed at another person.",
    "Personal attacks and harassment are not permitted.",
  ],

  sexual: [
    "Your content appears to contain explicit sexual material or sexually descriptive content.",
    "Sexual content may be restricted or prohibited depending on context and platform rules.",
  ],

  violence: [
    "Your content appears to contain depictions, descriptions, or promotion of violence.",
    "Violent content may be restricted when it promotes harm, injury, or dangerous behavior.",
  ],
};

const normalizeScore = (score: number) => Math.max(0, Math.min(1, score));

const formatCategoryLabel = (category: string) =>
  category
    .split("/")
    .map((part) => part.replace(/-/g, " "))
    .join(" / ");

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

const isHighRiskCategory = (primaryCategory: string | null) =>
  Boolean(primaryCategory && HIGH_RISK_CATEGORIES.has(primaryCategory));

const isLowConfidenceHighRiskCategory = (
  primaryCategory: string | null,
  topScore: number,
) =>
  isHighRiskCategory(primaryCategory) &&
  topScore < HIGH_RISK_TEMP_BAN_MIN_SCORE;

const determineRecommendedAction = (
  primaryCategory: string | null,
  topScore: number,
  flagged: boolean,
): ModerationDecision => {
  if (!flagged) return "IGNORE";

  if (!primaryCategory) return "WARN";

  if (isHighRiskCategory(primaryCategory)) {
    if (topScore >= HIGH_RISK_PERM_BAN_MIN_SCORE) return "BAN_PERM";
    if (topScore >= HIGH_RISK_TEMP_BAN_MIN_SCORE) return "BAN_TEMP";
    return "WARN";
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
  flagged: boolean,
) => {
  if (!flagged) {
    return ["No policy violation was identified."];
  }

  if (!primaryCategory) {
    return [
      "Content was flagged for a policy concern during moderation review.",
    ];
  }

  const mappedReasons = CATEGORY_REASON_MAP[primaryCategory];

  if (mappedReasons?.length) {
    return mappedReasons;
  }

  return [
    `We detected content that appears to violate our policy in relation to ${formatCategoryLabel(primaryCategory)}.`,
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
  const reasons = buildModerationReasons(primaryCategory, flagged);

  const severity = !flagged
    ? 0
    : isHighRiskCategory(primaryCategory)
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

export { buildAiModerationPolicy, isLowConfidenceHighRiskCategory };
