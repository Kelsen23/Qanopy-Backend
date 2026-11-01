import { z } from "zod";

const retrievalSourceSchema = z
  .object({
    type: z.enum(["INTERNAL_AI_ANSWERS", "KNOWLEDGE_BASE", "WEB"]),
    objectives: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const GenerationPlanSchema = z
  .object({
    schemaVersion: z.literal("1"),
    generationStrategy: z.enum(["TARGETED_REVISION", "FRESH_GENERATION"]),
    modelTier: z.enum(["BASIC", "STANDARD", "ADVANCED", "FRONTIER"]),
    reasoningEffort: z.enum(["LOW", "MEDIUM", "HIGH"]),
    retrievalSources: z.array(retrievalSourceSchema),
    generationObjectives: z.array(z.string().trim().min(1)).min(1),
    maxContextTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  })
  .strict()
  .superRefine((plan, ctx) => {
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
  });

const validateGenerationPlan = (
  input: unknown,
  context: {
    generationReason: "INITIAL_MANUAL" | "INITIAL_AUTO" | "FEEDBACK_REFINEMENT";
    maxContextTokens: number;
    maxOutputTokens: number;
  },
) => {
  const plan = GenerationPlanSchema.parse(input);
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
  GenerationPlanSchema.superRefine((plan, ctx) => {
    if (
      context.generationReason !== "FEEDBACK_REFINEMENT" &&
      plan.generationStrategy !== "FRESH_GENERATION"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["generationStrategy"],
        message: "Initial generation requires FRESH_GENERATION",
      });
    }

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

export {
  createGenerationPlanSchema,
  GenerationPlanSchema,
  validateGenerationPlan,
};
export type GenerationPlan = z.infer<typeof GenerationPlanSchema>;
