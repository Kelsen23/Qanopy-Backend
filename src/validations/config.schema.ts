import { z } from "zod";

import type {
  LLMFeatureRoute,
  LLMGatewayConfig,
} from "../services/llmGateway/llmGateway.types.js";

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

const fallbackRouteSchema = (providerKey: string, modelKey: string) =>
  z
    .object({
      provider: z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value.toLowerCase() : undefined))
        .pipe(providerSchema.optional()),
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

const llmGatewayConfigSchema: z.ZodType<LLMGatewayConfig> = z
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
    LLM_QUESTION_GATE_FALLBACK_PROVIDER: z.string().trim().optional(),
    LLM_QUESTION_GATE_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SECURITY_VERIFIER_PRIMARY_MODEL: requiredString(
      "LLM_SECURITY_VERIFIER_PRIMARY_MODEL",
    ),
    LLM_SECURITY_VERIFIER_FALLBACK_PROVIDER: z.string().trim().optional(),
    LLM_SECURITY_VERIFIER_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_SUGGESTION_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_SUGGESTION_GENERATION_PRIMARY_MODEL",
    ),
    LLM_SUGGESTION_GENERATION_FALLBACK_PROVIDER: z.string().trim().optional(),
    LLM_SUGGESTION_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_ANSWER_GENERATION_PRIMARY_PROVIDER: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_PROVIDER",
    )
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_ANSWER_GENERATION_PRIMARY_MODEL: requiredString(
      "LLM_ANSWER_GENERATION_PRIMARY_MODEL",
    ),
    LLM_ANSWER_GENERATION_FALLBACK_PROVIDER: z.string().trim().optional(),
    LLM_ANSWER_GENERATION_FALLBACK_MODEL: z.string().trim().optional(),

    LLM_EMBEDDINGS_PROVIDER: requiredString("LLM_EMBEDDINGS_PROVIDER")
      .transform((value) => value.toLowerCase())
      .pipe(providerSchema),
    LLM_EMBEDDINGS_MODEL: requiredString("LLM_EMBEDDINGS_MODEL"),
  })
  .transform((env) => {
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
  PORT: z.coerce.number().int().positive().default(5000),
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

const prismaConfigSchema = z.object({
  DATABASE_URL: requiredString("DATABASE_URL"),
  DIRECT_URL: requiredString("DIRECT_URL"),
});

export {
  llmGatewayConfigSchema,
  nodemailerConfigSchema,
  prismaConfigSchema,
  redisConfigSchema,
  s3ConfigSchema,
  serverConfigSchema,
  supportedProviders,
};
