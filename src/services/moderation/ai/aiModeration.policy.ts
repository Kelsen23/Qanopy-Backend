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

const CATEGORY_REASON_MAP: Record<string, string[]> = {
  "sexual/minors": [
    "Content includes sexual material involving minors.",
    "This is treated as a severe safety violation.",
  ],
  "violence/graphic": [
    "Content contains graphic violence.",
    "Graphic violent material is not allowed on the platform.",
  ],
  "self-harm/graphic": [
    "Content contains graphic self-harm material.",
    "Graphic self-harm content is not allowed on the platform.",
  ],
  "self-harm/instructions": [
    "Content appears to provide self-harm instructions.",
    "Instructions that facilitate self-harm are not allowed.",
  ],
  "hate/threatening": [
    "Content contains threatening hateful language.",
    "Threats or incitement toward protected groups are not allowed.",
  ],
  "harassment/threatening": [
    "Content contains threats or targeted harassment.",
    "Threatening behavior toward another person is not allowed.",
  ],
  "self-harm": ["Content references self-harm in a concerning manner."],
  "self-harm/intent": ["Content appears to express self-harm intent."],
  hate: ["Content contains hateful or degrading language."],
  harassment: ["Content targets another person with abusive language."],
  sexual: ["Content contains sexual material that is not allowed here."],
  violence: ["Content promotes or depicts violence."],
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
    `Content violates platform policy related to ${formatCategoryLabel(primaryCategory)}.`,
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
