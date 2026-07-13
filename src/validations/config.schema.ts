import { z } from "zod";

import type {
  LLMFeatureRoute,
  LLMGatewayConfig,
} from "../services/llmGateway/llmGateway.types.js";
import { supportsFeature } from "../services/llmGateway/llmGateway.capabilities.js";

const supportedProviders = [
  "openai",
  "anthropic",
  "openrouter",
  "voyage",
] as const;

const requiredString = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1, `${name} is required`);

const providerSchema = z.enum(supportedProviders);

const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const optionalProviderSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.toLowerCase() : undefined))
  .pipe(providerSchema.optional());

const fallbackRouteSchema = (providerKey: string, modelKey: string) =>
  z
    .object({
      provider: optionalProviderSchema,
      model: z.string().trim().optional(),
    })
    .superRefine((value, ctx) => {
      const hasProvider = Boolean(value.provider);
      const hasModel = Boolean(value.model);

      if (hasProvider !== hasModel) {
        ctx.addIssue({
          code: "custom",
          message: `${providerKey} and ${modelKey} must be configured together`,
          path: hasProvider ? ["model"] : ["provider"],
        });
      }
    })
    .transform((value) =>
      value.provider && value.model
        ? {
            provider: value.provider,
            model: value.model,
          }
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

type LlmGatewayEnvRulesInput = Partial<
  Record<
    | "LLM_MODERATION_PRIMARY_PROVIDER"
    | "LLM_QUESTION_GATE_PRIMARY_PROVIDER"
    | "LLM_QUESTION_GATE_FALLBACK_PROVIDER"
    | "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER"
    | "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER"
    | "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER"
    | "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER"
    | "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER"
    | "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER"
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
  validateFeatureProvider(
    ctx,
    "questionEligibilityGate",
    env.LLM_QUESTION_GATE_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_QUESTION_GATE_PRIMARY_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "questionEligibilityGate",
    env.LLM_QUESTION_GATE_FALLBACK_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_QUESTION_GATE_FALLBACK_PROVIDER",
  );
  validateFeatureProvider(
    ctx,
    "securityVerifier",
    env.LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER as
      | (typeof supportedProviders)[number]
      | undefined,
    "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER",
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
    LLM_QUESTION_GATE_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_QUESTION_GATE_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SECURITY_VERIFIER_PRIMARY_MODEL: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_MODEL",
    ),
    LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_SECURITY_VERIFIER_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SUGGESTION_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_MODEL",
    ),
    LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_SUGGESTION_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_ANSWER_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_ANSWER_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_MODEL",
    ),
    LLM_ANSWER_GENERATION_FALLBACK_PROVIDER: optionalProviderSchema,
    LLM_ANSWER_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),

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
    ).parse({
      provider: env.LLM_QUESTION_GATE_FALLBACK_PROVIDER,
      model: env.LLM_QUESTION_GATE_FALLBACK_MODEL,
    });
    const securityVerifierFallback = fallbackRouteSchema(
      "LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER",
      "LLM_SECURITY_VERIFIER_FALLBACK_MODEL",
    ).parse({
      provider: env.LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER,
      model: env.LLM_SECURITY_VERIFIER_FALLBACK_MODEL,
    });
    const aiSuggestionFallback = fallbackRouteSchema(
      "LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER",
      "LLM_SUGGESTION_GENERATION_FALLBACK_MODEL",
    ).parse({
      provider: env.LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER,
      model: env.LLM_SUGGESTION_GENERATION_FALLBACK_MODEL,
    });
    const aiAnswerFallback = fallbackRouteSchema(
      "LLM_ANSWER_GENERATION_FALLBACK_PROVIDER",
      "LLM_ANSWER_GENERATION_FALLBACK_MODEL",
    ).parse({
      provider: env.LLM_ANSWER_GENERATION_FALLBACK_PROVIDER,
      model: env.LLM_ANSWER_GENERATION_FALLBACK_MODEL,
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
          {
            provider: env.LLM_QUESTION_GATE_PRIMARY_PROVIDER,
            model: env.LLM_QUESTION_GATE_PRIMARY_MODEL,
          },
          questionGateFallback,
        ),
        securityVerifier: withFallback(
          {
            provider: env.LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER,
            model: env.LLM_SECURITY_VERIFIER_PRIMARY_MODEL,
          },
          securityVerifierFallback,
        ),
        aiSuggestion: withFallback(
          {
            provider: env.LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER,
            model: env.LLM_SUGGESTION_GENERATION_PRIMARY_MODEL,
          },
          aiSuggestionFallback,
        ),
        aiAnswer: withFallback(
          {
            provider: env.LLM_ANSWER_GENERATION_PRIMARY_PROVIDER,
            model: env.LLM_ANSWER_GENERATION_PRIMARY_MODEL,
          },
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

const serverConfigSchema = z.object({
  MONGO_URI: requiredString("MONGO_URI"),
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().positive().default(5000),
});

const authConfigSchema = z.object({
  JWT_SECRET: requiredString("JWT_SECRET"),
});

const googleOAuthConfigSchema = z.object({
  GOOGLE_CLIENT_ID: requiredString("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requiredString("GOOGLE_CLIENT_SECRET"),
});

const redisConfigSchema = z.object({
  REDIS_CACHE_URL: requiredString("REDIS_CACHE_URL"),
  REDIS_MESSAGING_URL: requiredString("REDIS_MESSAGING_URL"),
});

const s3ConfigSchema = z.object({
  BUCKET_NAME: requiredString("BUCKET_NAME"),
  BUCKET_REGION: requiredString("BUCKET_REGION"),
  ACCESS_KEY: requiredString("ACCESS_KEY"),
  SECRET_ACCESS_KEY: requiredString("SECRET_ACCESS_KEY"),
  CLOUDFRONT_DOMAIN: requiredString("CLOUDFRONT_DOMAIN"),
});

const nodemailerConfigSchema = z.object({
  SMTP_HOST: requiredString("SMTP_HOST"),
  SENDER_EMAIL: requiredString("SENDER_EMAIL"),
  SENDER_PASS: requiredString("SENDER_PASS"),
});

const emailIdentityConfigSchema = z.object({
  QANOPY_EMAIL: requiredString("QANOPY_EMAIL"),
  SUPPORT_EMAIL: requiredString("SUPPORT_EMAIL"),
});

const prismaConfigSchema = z.object({
  DATABASE_URL: requiredString("DATABASE_URL"),
  DIRECT_URL: requiredString("DIRECT_URL"),
});

const appEnvSchema = serverConfigSchema
  .merge(authConfigSchema)
  .merge(googleOAuthConfigSchema)
  .merge(prismaConfigSchema)
  .merge(redisConfigSchema)
  .merge(nodemailerConfigSchema)
  .merge(emailIdentityConfigSchema)
  .merge(s3ConfigSchema)
  .merge(llmGatewayEnvSchema)
  .superRefine((env, ctx) => {
    validateLlmGatewayEnvRules(env, ctx);
  });

export {
  appEnvSchema,
  authConfigSchema,
  emailIdentityConfigSchema,
  googleOAuthConfigSchema,
  llmGatewayEnvSchema,
  llmGatewayConfigSchema,
  nodemailerConfigSchema,
  nodeEnvSchema,
  prismaConfigSchema,
  redisConfigSchema,
  s3ConfigSchema,
  serverConfigSchema,
  supportedProviders,
};
