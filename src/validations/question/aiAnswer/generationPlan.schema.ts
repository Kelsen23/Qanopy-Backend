import { z } from "zod";

import aiAnswerRetrievalLimits from "../../../config/aiAnswerRetrieval.config.js";

const MAX_GENERATION_OBJECTIVES = 8;
const MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE = 4;
const MAX_TOTAL_OBJECTIVES = 12;

const retrievalSourceTypeSchema = z.enum([
  "INTERNAL_AI_ANSWERS",
  "KNOWLEDGE_BASE",
  "WEB",
]);

const retrievalSourceSchema = z
  .object({
    type: retrievalSourceTypeSchema,
    objectives: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE),
    maxCalls: z
      .number()
      .int()
      .min(1)
      .max(aiAnswerRetrievalLimits.maxTotalToolCalls),
    maxEvidenceTokens: z
      .number()
      .int()
      .min(1)
      .max(aiAnswerRetrievalLimits.maxTotalEvidenceTokens),
  })
  .strict();

const planFields = {
  schemaVersion: z.literal("2"),
  modelTier: z.enum(["BASIC", "STANDARD", "ADVANCED", "FRONTIER"]),
  reasoningEffort: z.enum(["LOW", "MEDIUM", "HIGH"]),
  retrievalSources: z.array(retrievalSourceSchema).max(3),
  maxTotalToolCalls: z
    .number()
    .int()
    .min(0)
    .max(aiAnswerRetrievalLimits.maxTotalToolCalls),
  maxTotalEvidenceTokens: z
    .number()
    .int()
    .min(0)
    .max(aiAnswerRetrievalLimits.maxTotalEvidenceTokens),
  generationObjectives: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(MAX_GENERATION_OBJECTIVES),
};

type PlanWithObjectives = {
  retrievalSources: Array<{
    type: z.infer<typeof retrievalSourceTypeSchema>;
    objectives: string[];
    maxCalls: number;
    maxEvidenceTokens: number;
  }>;
  generationObjectives: string[];
  maxTotalToolCalls: number;
  maxTotalEvidenceTokens: number;
};

const validatePlan = (plan: PlanWithObjectives, ctx: z.RefinementCtx) => {
  const seen = new Set<string>();

  for (const [index, source] of plan.retrievalSources.entries()) {
    if (seen.has(source.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "type"],
        message: "Retrieval source types must be unique",
      });
    }

    seen.add(source.type);

    const ceiling = aiAnswerRetrievalLimits.sources[source.type];

    if (source.maxCalls < ceiling.minCalls) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "maxCalls"],
        message: `Minimum call allowance for ${source.type} is ${ceiling.minCalls}`,
      });
    }

    if (source.maxCalls > ceiling.maxCalls) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "maxCalls"],
        message: `Maximum calls for ${source.type} is ${ceiling.maxCalls}`,
      });
    }

    if (source.maxEvidenceTokens > ceiling.maxEvidenceTokens) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "maxEvidenceTokens"],
        message: `Maximum evidence tokens for ${source.type} is ${ceiling.maxEvidenceTokens}`,
      });
    }

    if (source.maxEvidenceTokens < ceiling.minEvidenceTokens) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "maxEvidenceTokens"],
        message: `Minimum evidence allowance for ${source.type} is ${ceiling.minEvidenceTokens}`,
      });
    }
  }

  const totalObjectives =
    plan.generationObjectives.length +
    plan.retrievalSources.reduce(
      (total, source) => total + source.objectives.length,
      0,
    );

  if (totalObjectives > MAX_TOTAL_OBJECTIVES) {
    ctx.addIssue({
      code: "custom",
      path: ["generationObjectives"],
      message: `A generation plan may contain at most ${MAX_TOTAL_OBJECTIVES} total objectives`,
    });
  }

  const sumCalls = plan.retrievalSources.reduce(
    (total, source) => total + source.maxCalls,
    0,
  );

  const sumEvidenceTokens = plan.retrievalSources.reduce(
    (total, source) => total + source.maxEvidenceTokens,
    0,
  );

  if (
    plan.maxTotalToolCalls > sumCalls ||
    (sumCalls > 0 &&
      plan.maxTotalToolCalls <
        aiAnswerRetrievalLimits.minSelectedTotalToolCalls)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["maxTotalToolCalls"],
      message:
        "Total tool-call budget must be positive and cannot exceed source budgets",
    });
  }

  if (
    plan.maxTotalEvidenceTokens > sumEvidenceTokens ||
    (sumEvidenceTokens > 0 &&
      plan.maxTotalEvidenceTokens <
        aiAnswerRetrievalLimits.minSelectedTotalEvidenceTokens)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["maxTotalEvidenceTokens"],
      message:
        "Total evidence budget must be positive and cannot exceed source budgets",
    });
  }
};

const GenerationPlanSchema = z
  .object(planFields)
  .strict()
  .superRefine(validatePlan);

const PlannerGenerationPlanSchema = z
  .object({
    ...planFields,
    maxContextTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  })
  .strict()
  .superRefine(validatePlan);

const validateGenerationPlan = (
  input: unknown,
  context: { maxContextTokens: number; maxOutputTokens: number },
) => {
  const plan = PlannerGenerationPlanSchema.parse(input);

  if (
    plan.maxContextTokens > context.maxContextTokens ||
    plan.maxOutputTokens > context.maxOutputTokens
  ) {
    throw new Error("GenerationPlan exceeds configured token limits");
  }
  return plan;
};

const createGenerationPlanSchema = (
  context: Parameters<typeof validateGenerationPlan>[1],
) =>
  PlannerGenerationPlanSchema.superRefine((plan, ctx) => {
    if (
      plan.maxContextTokens > context.maxContextTokens ||
      plan.maxOutputTokens > context.maxOutputTokens
    ) {
      ctx.addIssue({
        code: "custom",
        message: "GenerationPlan exceeds configured token limits",
      });
    }
  });

type GenerationPlan = z.infer<typeof GenerationPlanSchema>;
type PlannerGenerationPlan = z.infer<typeof PlannerGenerationPlanSchema>;

const GenerationPlanMetadataSchema = z.object({
  maxContextTokens: z.number().int().positive().max(64000),
  maxOutputTokens: z.number().int().positive().max(8192),
  plannerFallbackUsed: z.boolean(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number().nonnegative(),
  usage: z.unknown(),
  cost: z.unknown(),
});

type GenerationPlanMetadata = z.infer<typeof GenerationPlanMetadataSchema>;

export {
  createGenerationPlanSchema,
  GenerationPlanMetadataSchema,
  GenerationPlanSchema,
  MAX_GENERATION_OBJECTIVES,
  MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE,
  MAX_TOTAL_OBJECTIVES,
  PlannerGenerationPlanSchema,
  validateGenerationPlan,
};
export type { GenerationPlan, GenerationPlanMetadata, PlannerGenerationPlan };
