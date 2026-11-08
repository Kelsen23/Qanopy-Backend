import { z } from "zod";

const MAX_GENERATION_OBJECTIVES = 8;
const MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE = 4;
const MAX_TOTAL_OBJECTIVES = 12;

const retrievalSourceSchema = z
  .object({
    type: z.enum(["INTERNAL_AI_ANSWERS", "KNOWLEDGE_BASE", "WEB"]),
    objectives: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE),
  })
  .strict();

const validatePlanObjectives = (
  plan: {
    retrievalSources: Array<{ type: string; objectives: string[] }>;
    generationObjectives: string[];
  },
  ctx: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  plan.retrievalSources.forEach((source, index) => {
    if (seen.has(source.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["retrievalSources", index, "type"],
        message: "Retrieval source types must be unique",
      });
    }
    seen.add(source.type);
  });

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
};

const GenerationPlanSchema = z
  .object({
    modelTier: z.enum(["BASIC", "STANDARD", "ADVANCED", "FRONTIER"]),
    reasoningEffort: z.enum(["LOW", "MEDIUM", "HIGH"]),
    retrievalSources: z.array(retrievalSourceSchema).max(3),
    generationObjectives: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_GENERATION_OBJECTIVES),
  })
  .strict()
  .superRefine(validatePlanObjectives);

const PlannerGenerationPlanSchema = z
  .object({
    modelTier: z.enum(["BASIC", "STANDARD", "ADVANCED", "FRONTIER"]),
    reasoningEffort: z.enum(["LOW", "MEDIUM", "HIGH"]),
    retrievalSources: z.array(retrievalSourceSchema).max(3),
    generationObjectives: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_GENERATION_OBJECTIVES),
    maxContextTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  })
  .strict()
  .superRefine(validatePlanObjectives);

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
    try {
      validateGenerationPlan(plan, context);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid generation plan",
      });
    }
  });

type GenerationPlan = z.infer<typeof GenerationPlanSchema>;
type PlannerGenerationPlan = z.infer<typeof PlannerGenerationPlanSchema>;
type GenerationPlanMetadata = Pick<
  PlannerGenerationPlan,
  "maxContextTokens" | "maxOutputTokens"
> & {
  plannerFallbackUsed: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  usage: unknown;
  cost: unknown;
};

export {
  createGenerationPlanSchema,
  GenerationPlanSchema,
  MAX_GENERATION_OBJECTIVES,
  MAX_RETRIEVAL_OBJECTIVES_PER_SOURCE,
  MAX_TOTAL_OBJECTIVES,
  PlannerGenerationPlanSchema,
  validateGenerationPlan,
};
export type { GenerationPlan, GenerationPlanMetadata, PlannerGenerationPlan };
