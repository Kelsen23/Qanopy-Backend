import { z } from "zod";

const defaults = {
  AI_ANSWER_RETRIEVAL_MIN_SELECTED_TOTAL_TOOL_CALLS: 1,
  AI_ANSWER_RETRIEVAL_MAX_TOTAL_TOOL_CALLS: 8,
  AI_ANSWER_RETRIEVAL_MIN_SELECTED_TOTAL_EVIDENCE_TOKENS: 500,
  AI_ANSWER_RETRIEVAL_MAX_TOTAL_EVIDENCE_TOKENS: 12000,

  AI_ANSWER_RETRIEVAL_INTERNAL_AI_ANSWERS_MIN_CALLS: 1,
  AI_ANSWER_RETRIEVAL_INTERNAL_AI_ANSWERS_MAX_CALLS: 2,
  AI_ANSWER_RETRIEVAL_INTERNAL_AI_ANSWERS_MIN_EVIDENCE_TOKENS: 500,
  AI_ANSWER_RETRIEVAL_INTERNAL_AI_ANSWERS_MAX_EVIDENCE_TOKENS: 4000,

  AI_ANSWER_RETRIEVAL_KNOWLEDGE_BASE_MIN_CALLS: 1,
  AI_ANSWER_RETRIEVAL_KNOWLEDGE_BASE_MAX_CALLS: 3,
  AI_ANSWER_RETRIEVAL_KNOWLEDGE_BASE_MIN_EVIDENCE_TOKENS: 500,
  AI_ANSWER_RETRIEVAL_KNOWLEDGE_BASE_MAX_EVIDENCE_TOKENS: 6000,

  AI_ANSWER_RETRIEVAL_WEB_MIN_CALLS: 1,
  AI_ANSWER_RETRIEVAL_WEB_MAX_CALLS: 4,
  AI_ANSWER_RETRIEVAL_WEB_MIN_EVIDENCE_TOKENS: 500,
  AI_ANSWER_RETRIEVAL_WEB_MAX_EVIDENCE_TOKENS: 8000,
} as const;

const positiveIntegerEnv = (name: string, fallback: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return fallback;

      const parsed = Number(value);

      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) {
        ctx.addIssue({
          code: "custom",
          message: `${name} must be a positive integer`,
        });

        return z.NEVER;
      }

      return parsed;
    });

const aiAnswerRetrievalEnvSchema = z.object(
  Object.fromEntries(
    Object.entries(defaults).map(([name, fallback]) => [
      name,
      positiveIntegerEnv(name, fallback),
    ]),
  ),
);

const sourceLimits = (env: Record<string, number>, source: string) => ({
  minCalls: env[`AI_ANSWER_RETRIEVAL_${source}_MIN_CALLS`],
  maxCalls: env[`AI_ANSWER_RETRIEVAL_${source}_MAX_CALLS`],
  minEvidenceTokens: env[`AI_ANSWER_RETRIEVAL_${source}_MIN_EVIDENCE_TOKENS`],
  maxEvidenceTokens: env[`AI_ANSWER_RETRIEVAL_${source}_MAX_EVIDENCE_TOKENS`],
});

const aiAnswerRetrievalConfigSchema = aiAnswerRetrievalEnvSchema
  .transform((env) => ({
    minSelectedTotalToolCalls:
      env.AI_ANSWER_RETRIEVAL_MIN_SELECTED_TOTAL_TOOL_CALLS,
    maxTotalToolCalls: env.AI_ANSWER_RETRIEVAL_MAX_TOTAL_TOOL_CALLS,
    minSelectedTotalEvidenceTokens:
      env.AI_ANSWER_RETRIEVAL_MIN_SELECTED_TOTAL_EVIDENCE_TOKENS,
    maxTotalEvidenceTokens: env.AI_ANSWER_RETRIEVAL_MAX_TOTAL_EVIDENCE_TOKENS,

    sources: {
      INTERNAL_AI_ANSWERS: sourceLimits(env, "INTERNAL_AI_ANSWERS"),
      KNOWLEDGE_BASE: sourceLimits(env, "KNOWLEDGE_BASE"),
      WEB: sourceLimits(env, "WEB"),
    },
  }))
  .superRefine((limits, ctx) => {
    if (limits.minSelectedTotalToolCalls > limits.maxTotalToolCalls) {
      ctx.addIssue({
        code: "custom",
        path: ["minSelectedTotalToolCalls"],
        message: "Minimum total tool calls cannot exceed the maximum",
      });
    }

    if (limits.minSelectedTotalEvidenceTokens > limits.maxTotalEvidenceTokens) {
      ctx.addIssue({
        code: "custom",
        path: ["minSelectedTotalEvidenceTokens"],
        message: "Minimum total evidence tokens cannot exceed the maximum",
      });
    }

    for (const [type, source] of Object.entries(limits.sources)) {
      if (
        source.minCalls > source.maxCalls ||
        source.maxCalls > limits.maxTotalToolCalls ||
        source.maxCalls < limits.minSelectedTotalToolCalls
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sources", type, "maxCalls"],
          message: "Source call range is incompatible with total call limits",
        });
      }

      if (
        source.minEvidenceTokens > source.maxEvidenceTokens ||
        source.maxEvidenceTokens > limits.maxTotalEvidenceTokens ||
        source.maxEvidenceTokens < limits.minSelectedTotalEvidenceTokens
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sources", type, "maxEvidenceTokens"],
          message:
            "Source evidence range is incompatible with total evidence limits",
        });
      }
    }
  });

export { aiAnswerRetrievalConfigSchema, aiAnswerRetrievalEnvSchema };
