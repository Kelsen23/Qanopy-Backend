import { z } from "zod";

const MAX_WEB_SEARCH_QUERY_LENGTH = 400;
const MAX_WEB_SEARCH_DOMAINS = 10;

const webSearchDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/,
    "Provide a valid hostname without a scheme, path, or port",
  );

const webSearchToolInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_WEB_SEARCH_QUERY_LENGTH),
    freshness: z.enum(["day", "week", "month", "year"]).optional(),
    allowedDomains: z
      .array(webSearchDomainSchema)
      .max(MAX_WEB_SEARCH_DOMAINS)
      .optional(),
    excludedDomains: z
      .array(webSearchDomainSchema)
      .max(MAX_WEB_SEARCH_DOMAINS)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    for (const key of ["allowedDomains", "excludedDomains"] as const) {
      const domains = input[key] ?? [];
      if (new Set(domains).size !== domains.length) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must not contain duplicates`,
        });
      }
    }

    const allowed = new Set(input.allowedDomains ?? []);
    if ((input.excludedDomains ?? []).some((domain) => allowed.has(domain))) {
      ctx.addIssue({
        code: "custom",
        path: ["excludedDomains"],
        message: "A domain cannot be both allowed and excluded",
      });
    }
  });

const webSearchToolResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("READY"),
      remainingCalls: z.number().int().nonnegative(),
      remainingEvidenceTokens: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("LIMITS_DRAINED"),
      drainedLimits: z.array(z.enum(["calls", "evidence_tokens"])).min(1),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("INVALID_ARGUMENTS"),
      message: z.string().min(1),
    })
    .strict(),
]);

const braveLlmContextResponseSchema = z
  .object({
    grounding: z.object({
      generic: z.array(
        z
          .object({
            url: z.string().url(),
            title: z.string(),
            snippets: z.array(z.string()),
          })
          .passthrough(),
      ),
    }),
    sources: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const webSearchEvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    passageId: z.string().min(1),
    title: z.string(),
    url: z.string().url(),
    sourceDomain: z.string().min(1),
    text: z.string().min(1),
    retrievedAt: z.string().datetime(),
    fetchedContentAt: z.string().datetime().optional(),
  })
  .strict();

const webSearchAdapterResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("SEARCH_COMPLETE"),
      evidence: z.array(webSearchEvidenceSchema),
      evidenceTokensUsed: z.number().int().nonnegative(),
      retrievedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      status: z.literal("NO_RESULTS"),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("BUDGET_EXHAUSTED"),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("INVALID_ARGUMENTS"),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("PROVIDER_RESPONSE_INVALID"),
      message: z.string().min(1),
      retryable: z.literal(false),
    })
    .strict(),
  z
    .object({
      status: z.literal("PROVIDER_TIMEOUT"),
      message: z.string().min(1),
      retryable: z.literal(true),
    })
    .strict(),
  z
    .object({
      status: z.literal("PROVIDER_RATE_LIMITED"),
      message: z.string().min(1),
      retryable: z.literal(true),
      retryAfterMs: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("PROVIDER_UNAVAILABLE"),
      message: z.string().min(1),
      retryable: z.literal(true),
    })
    .strict(),
  z
    .object({
      status: z.literal("PROVIDER_REQUEST_REJECTED"),
      message: z.string().min(1),
      retryable: z.literal(false),
    })
    .strict(),
  z
    .object({
      status: z.literal("RATE_LIMITED"),
      message: z.string().min(1),
      retryable: z.literal(true),
      retryAfterMs: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("SERVICE_UNAVAILABLE"),
      message: z.string().min(1),
      retryable: z.literal(true),
    })
    .strict(),
]);

const webSearchToolExecutionResultSchema = z.union([
  webSearchToolResultSchema,
  webSearchAdapterResultSchema,
]);

export {
  MAX_WEB_SEARCH_QUERY_LENGTH,
  braveLlmContextResponseSchema,
  webSearchAdapterResultSchema,
  webSearchEvidenceSchema,
  webSearchToolInputSchema,
  webSearchToolExecutionResultSchema,
  webSearchToolResultSchema,
};
export type WebSearchToolInput = z.infer<typeof webSearchToolInputSchema>;
export type WebSearchToolResult = z.infer<typeof webSearchToolResultSchema>;
export type WebSearchAdapterResult = z.infer<
  typeof webSearchAdapterResultSchema
>;
export type WebSearchToolExecutionResult = z.infer<
  typeof webSearchToolExecutionResultSchema
>;
export type WebSearchEvidence = z.infer<typeof webSearchEvidenceSchema>;
