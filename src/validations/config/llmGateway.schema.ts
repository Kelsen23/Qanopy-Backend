import { z } from "zod";

import type {
  LLMFeatureRoute,
  LLMGatewayConfig,
  LLMReasoningEffort,
  LLMRoute,
} from "../../services/llmGateway/llmGateway.types.js";
import {
  supportsCapability,
  supportsFeature,
} from "../../services/llmGateway/llmGateway.capabilities.js";

import {
  optionalProviderSchema,
  providerSchema,
  requiredString,
  supportedProviders,
} from "./shared.js";

const supportedReasoningEfforts = [
  "low",
  "medium",
  "high",
  "max",
] as const satisfies LLMReasoningEffort[];

const omitReasoningEffortValues = ["auto", "default"] as const;

const optionalReasoningEffortSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    const normalized = value?.toLowerCase();

    return normalized && !omitReasoningEffortValues.includes(normalized as never)
      ? normalized
      : undefined;
  })
  .pipe(z.enum(supportedReasoningEfforts).optional());

const withReasoningEffort = (
  route: Omit<LLMRoute, "reasoning">,
  effort?: LLMReasoningEffort,
): LLMRoute => ({
  ...route,
  ...(effort ? { reasoning: { effort } } : {}),
});

const fallbackRouteSchema = (
  providerKey: string,
  modelKey: string,
  effortKey: string,
) =>
  z
    .object({
      provider: optionalProviderSchema,
      model: z.string().trim().optional(),
      effort: optionalReasoningEffortSchema,
    })
    .superRefine((value, ctx) => {
      const hasProvider = Boolean(value.provider);
      const hasModel = Boolean(value.model);
      const hasEffort = Boolean(value.effort);

      if (hasProvider !== hasModel) {
        ctx.addIssue({
          code: "custom",
          message: `${providerKey} and ${modelKey} must be configured together`,
          path: hasProvider ? ["model"] : ["provider"],
        });
      }

      if (hasEffort && (!hasProvider || !hasModel)) {
        ctx.addIssue({
          code: "custom",
          message: `${effortKey} requires ${providerKey} and ${modelKey}`,
          path: ["effort"],
        });
      }
    })
    .transform((value) =>
      value.provider && value.model
        ? withReasoningEffort(
            {
              provider: value.provider,
              model: value.model,
            },
            value.effort,
          )
        : undefined,
    );

const withFallback = (
  primary: LLMFeatureRoute["primary"],
  fallback: LLMFeatureRoute["fallback"],
): LLMFeatureRoute => ({
  primary,
  ...(fallback ? { fallback } : {}),
});

const validateFeatureProvider = (
  ctx: z.RefinementCtx,
  feature: keyof LLMGatewayConfig["routes"],
  provider: (typeof supportedProviders)[number] | undefined,
  path: string,
) => {
  if (!provider || supportsFeature(provider, feature)) return;

  ctx.addIssue({
    code: "custom",
    message: `${provider} does not support ${feature}`,
    path: [path],
  });
};

const validateReasoningProvider = (
  ctx: z.RefinementCtx,
  provider: (typeof supportedProviders)[number] | undefined,
  effort: LLMReasoningEffort | undefined,
  path: string,
) => {
  if (!provider || !effort || supportsCapability(provider, "reasoningEffort")) {
    return;
  }

  ctx.addIssue({
    code: "custom",
    message: `${provider} does not support reasoning effort`,
    path: [path],
  });
};

type LlmGatewayEnvRulesInput = Partial<
  Record<
    | "LLM_MODERATION_PRIMARY_PROVIDER"
    | "LLM_QUESTION_GATE_PRIMARY_PROVIDER"
    | "LLM_QUESTION_GATE_PRIMARY_EFFORT"
    | "LLM_QUESTION_GATE_FALLBACK_PROVIDER"
    | "LLM_QUESTION_GATE_FALLBACK_EFFORT"
    | "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER"
    | "LLM_SECURITY_VERIFIER_PRIMARY_EFFORT"
    | "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER"
    | "LLM_SECURITY_VERIFIER_FALLBACK_EFFORT"
    | "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER"
    | "LLM_SUGGESTION_GENERATION_PRIMARY_EFFORT"
    | "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER"
    | "LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT"
    | "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER"
    | "LLM_ANSWER_GENERATION_PRIMARY_EFFORT"
    | "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER"
    | "LLM_ANSWER_GENERATION_FALLBACK_EFFORT"
    | "LLM_EMBEDDINGS_PROVIDER"
    | "LLM_QUESTION_GATE_FALLBACK_MODEL"
    | "LLM_SECURITY_VERIFIER_FALLBACK_MODEL"
    | "LLM_SUGGESTION_GENERATION_FALLBACK_MODEL"
    | "LLM_ANSWER_GENERATION_FALLBACK_MODEL",
    string | undefined
  >
>;

const validateLlmGatewayEnvRules = (
  env: LlmGatewayEnvRulesInput,
  ctx: z.RefinementCtx,
) => {
  const fallbackPairs = [
    ["LLM_QUESTION_GATE_FALLBACK_PROVIDER", "LLM_QUESTION_GATE_FALLBACK_MODEL"],
    [
      "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER",
      "LLM_SECURITY_VERIFIER_FALLBACK_MODEL",
    ],
    [
      "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER",
      "LLM_SUGGESTION_GENERATION_FALLBACK_MODEL",
    ],
    [
      "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER",
      "LLM_ANSWER_GENERATION_FALLBACK_MODEL",
    ],
  ] as const;

  for (const [providerKey, modelKey] of fallbackPairs) {
    const hasProvider = Boolean(env[providerKey]);
    const hasModel = Boolean(env[modelKey]);

    if (hasProvider !== hasModel) {
      ctx.addIssue({
        code: "custom",
        message: `${providerKey} and ${modelKey} must be configured together`,
        path: [hasProvider ? modelKey : providerKey],
      });
    }
  }

  validateFeatureProvider(
    ctx,
    "moderation",
    env.LLM_MODERATION_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_MODERATION_PRIMARY_PROVIDER",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_QUESTION_GATE_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_QUESTION_GATE_PRIMARY_EFFORT as LLMReasoningEffort | undefined,
    "LLM_QUESTION_GATE_PRIMARY_EFFORT",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_QUESTION_GATE_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_QUESTION_GATE_FALLBACK_EFFORT as LLMReasoningEffort | undefined,
    "LLM_QUESTION_GATE_FALLBACK_EFFORT",
  );
  validateFeatureProvider(
    ctx,
    "questionEligibilityGate",
    env.LLM_QUESTION_GATE_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_QUESTION_GATE_PRIMARY_PROVIDER",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_SECURITY_VERIFIER_PRIMARY_EFFORT as LLMReasoningEffort | undefined,
    "LLM_SECURITY_VERIFIER_PRIMARY_EFFORT",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_SECURITY_VERIFIER_FALLBACK_EFFORT as LLMReasoningEffort | undefined,
    "LLM_SECURITY_VERIFIER_FALLBACK_EFFORT",
  );
  validateFeatureProvider(
    ctx,
    "questionEligibilityGate",
    env.LLM_QUESTION_GATE_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_QUESTION_GATE_FALLBACK_PROVIDER",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_SUGGESTION_GENERATION_PRIMARY_EFFORT as
      | LLMReasoningEffort
      | undefined,
    "LLM_SUGGESTION_GENERATION_PRIMARY_EFFORT",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT as
      | LLMReasoningEffort
      | undefined,
    "LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT",
  );
  validateFeatureProvider(
    ctx,
    "securityVerifier",
    env.LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_ANSWER_GENERATION_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_ANSWER_GENERATION_PRIMARY_EFFORT as LLMReasoningEffort | undefined,
    "LLM_ANSWER_GENERATION_PRIMARY_EFFORT",
  );
  validateReasoningProvider(
    ctx,
    env.LLM_ANSWER_GENERATION_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    env.LLM_ANSWER_GENERATION_FALLBACK_EFFORT as LLMReasoningEffort | undefined,
    "LLM_ANSWER_GENERATION_FALLBACK_EFFORT",
  );
  validateFeatureProvider(
    ctx,
    "securityVerifier",
    env.LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "aiSuggestion",
    env.LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "aiSuggestion",
    env.LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "aiAnswer",
    env.LLM_ANSWER_GENERATION_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "aiAnswer",
    env.LLM_ANSWER_GENERATION_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "embeddings",
    env.LLM_EMBEDDINGS_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_EMBEDDINGS_PROVIDER",
  );
};

const llmGatewayEnvSchema = z
  .object({
    OPENAI_API_KEY: requiredString("OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: requiredString("ANTHROPIC_API_KEY"),
    OPENROUTER_API_KEY: requiredString("OPENROUTER_API_KEY"),
    VOYAGE_API_KEY: requiredString("VOYAGE_API_KEY"),

    LLM_MODERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_MODERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_MODERATION_PRIMARY_MODEL: requiredString(
      "LLM_MODERATION_PRIMARY_MODEL",
    ),

    LLM_QUESTION_GATE_PRIMARY_PROVIDER: requiredString(
      "LLM_QUESTION_GATE_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_QUESTION_GATE_PRIMARY_MODEL: requiredString(
      "LLM_QUESTION_GATE_PRIMARY_MODEL",
    ),
    LLM_QUESTION_GATE_PRIMARY_EFFORT: optionalReasoningEffortSchema,
    LLM_QUESTION_GATE_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_QUESTION_GATE_FALLBACK_MODEL: z.string().trim().optional(),
    LLM_QUESTION_GATE_FALLBACK_EFFORT: optionalReasoningEffortSchema,

    LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SECURITY_VERIFIER_PRIMARY_MODEL: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_MODEL",
    ),
    LLM_SECURITY_VERIFIER_PRIMARY_EFFORT: optionalReasoningEffortSchema,
    LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_SECURITY_VERIFIER_FALLBACK_MODEL: z.string().trim().optional(),
    LLM_SECURITY_VERIFIER_FALLBACK_EFFORT: optionalReasoningEffortSchema,

    LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SUGGESTION_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_MODEL",
    ),
    LLM_SUGGESTION_GENERATION_PRIMARY_EFFORT: optionalReasoningEffortSchema,
    LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_SUGGESTION_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),
    LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT: optionalReasoningEffortSchema,

    LLM_ANSWER_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_ANSWER_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_MODEL",
    ),
    LLM_ANSWER_GENERATION_PRIMARY_EFFORT: optionalReasoningEffortSchema,
    LLM_ANSWER_GENERATION_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_ANSWER_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),
    LLM_ANSWER_GENERATION_FALLBACK_EFFORT: optionalReasoningEffortSchema,

    LLM_EMBEDDINGS_PROVIDER: requiredString("LLM_EMBEDDINGS_PROVIDER")
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_EMBEDDINGS_MODEL: requiredString("LLM_EMBEDDINGS_MODEL"),
  })
  .superRefine((env, ctx) => {
    validateLlmGatewayEnvRules(env, ctx);
  });

const llmGatewayConfigSchema: z.ZodType<LLMGatewayConfig> =
  llmGatewayEnvSchema.transform((env) => {
    const questionGateFallback = fallbackRouteSchema(
      "LLM_QUESTION_GATE_FALLBACK_PROVIDER",
      "LLM_QUESTION_GATE_FALLBACK_MODEL",
      "LLM_QUESTION_GATE_FALLBACK_EFFORT",
    ).parse({
      provider: env.LLM_QUESTION_GATE_FALLBACK_PROVIDER,
      model: env.LLM_QUESTION_GATE_FALLBACK_MODEL,
      effort: env.LLM_QUESTION_GATE_FALLBACK_EFFORT,
    });
    const securityVerifierFallback = fallbackRouteSchema(
      "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER",
      "LLM_SECURITY_VERIFIER_FALLBACK_MODEL",
      "LLM_SECURITY_VERIFIER_FALLBACK_EFFORT",
    ).parse({
      provider: env.LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER,
      model: env.LLM_SECURITY_VERIFIER_FALLBACK_MODEL,
      effort: env.LLM_SECURITY_VERIFIER_FALLBACK_EFFORT,
    });
    const aiSuggestionFallback = fallbackRouteSchema(
      "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER",
      "LLM_SUGGESTION_GENERATION_FALLBACK_MODEL",
      "LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT",
    ).parse({
      provider: env.LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER,
      model: env.LLM_SUGGESTION_GENERATION_FALLBACK_MODEL,
      effort: env.LLM_SUGGESTION_GENERATION_FALLBACK_EFFORT,
    });
    const aiAnswerFallback = fallbackRouteSchema(
      "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER",
      "LLM_ANSWER_GENERATION_FALLBACK_MODEL",
      "LLM_ANSWER_GENERATION_FALLBACK_EFFORT",
    ).parse({
      provider: env.LLM_ANSWER_GENERATION_FALLBACK_PROVIDER,
      model: env.LLM_ANSWER_GENERATION_FALLBACK_MODEL,
      effort: env.LLM_ANSWER_GENERATION_FALLBACK_EFFORT,
    });

    return {
      routes: {
        moderation: {
          primary: {
            provider: env.LLM_MODERATION_PRIMARY_PROVIDER,
            model: env.LLM_MODERATION_PRIMARY_MODEL,
          },
        },
        questionEligibilityGate: withFallback(
          withReasoningEffort(
            {
              provider: env.LLM_QUESTION_GATE_PRIMARY_PROVIDER,
              model: env.LLM_QUESTION_GATE_PRIMARY_MODEL,
            },
            env.LLM_QUESTION_GATE_PRIMARY_EFFORT,
          ),
          questionGateFallback,
        ),
        securityVerifier: withFallback(
          withReasoningEffort(
            {
              provider: env.LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER,
              model: env.LLM_SECURITY_VERIFIER_PRIMARY_MODEL,
            },
            env.LLM_SECURITY_VERIFIER_PRIMARY_EFFORT,
          ),
          securityVerifierFallback,
        ),
        aiSuggestion: withFallback(
          withReasoningEffort(
            {
              provider: env.LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER,
              model: env.LLM_SUGGESTION_GENERATION_PRIMARY_MODEL,
            },
            env.LLM_SUGGESTION_GENERATION_PRIMARY_EFFORT,
          ),
          aiSuggestionFallback,
        ),
        aiAnswer: withFallback(
          withReasoningEffort(
            {
              provider: env.LLM_ANSWER_GENERATION_PRIMARY_PROVIDER,
              model: env.LLM_ANSWER_GENERATION_PRIMARY_MODEL,
            },
            env.LLM_ANSWER_GENERATION_PRIMARY_EFFORT,
          ),
          aiAnswerFallback,
        ),
        embeddings: {
          primary: {
            provider: env.LLM_EMBEDDINGS_PROVIDER,
            model: env.LLM_EMBEDDINGS_MODEL,
          },
        },
      },
      apiKeys: {
        openai: env.OPENAI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY,
        openrouter: env.OPENROUTER_API_KEY,
        voyage: env.VOYAGE_API_KEY,
      },
    } satisfies LLMGatewayConfig;
  });

export {
  llmGatewayConfigSchema,
  llmGatewayEnvSchema,
  validateLlmGatewayEnvRules,
};
