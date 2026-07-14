import z from "zod";

const questionEligibilityGateSchema = z
  .object({
    decision: z.enum(["allow", "clarify", "reject"]),
    eligibleForDownstreamProcessing: z.boolean(),
    understandability: z
      .object({
        status: z.enum([
          "understandable",
          "ambiguous_but_usable",
          "too_vague",
          "fragmented",
          "nonsense",
        ]),
        reason: z.string(),
      })
      .strict(),
    softwareValidity: z
      .object({
        isSoftwareRelated: z.boolean(),
        hasRealQuestionOrProblem: z.boolean(),
        intent: z.enum([
          "debugging",
          "implementation",
          "architecture",
          "conceptual_explanation",
          "tooling_config",
          "error_explanation",
          "code_review",
          "non_software",
          "no_real_problem",
          "unknown",
        ]),
        technologies: z.array(z.string()),
        questionableEntities: z.array(z.string()),
      })
      .strict(),
    answerability: z
      .object({
        status: z.enum(["answerable", "needs_clarification", "not_answerable"]),
        missingContext: z.array(z.string()),
      })
      .strict(),
    security: z
      .object({
        promptInjectionRisk: z.enum(["none", "low", "medium", "high"]),
        hasSuspiciousInstructionalText: z.boolean(),
        harmfulTechnicalIntent: z.enum([
          "none",
          "cyber_dual_use",
          "credential_theft",
          "malware",
          "abuse_evasion",
          "privacy_invasion",
          "unknown",
        ]),
        reason: z.string(),
      })
      .strict(),
    userFacingReason: z.string(),
    internalReason: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedEligibility = value.decision === "allow";

    if (value.eligibleForDownstreamProcessing !== expectedEligibility) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eligibleForDownstreamProcessing"],
        message:
          "eligibleForDownstreamProcessing must be true only when decision is allow",
      });
    }

    if (
      value.answerability.status === "answerable" &&
      value.answerability.missingContext.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answerability", "missingContext"],
        message: "answerable results cannot list missing context",
      });
    }

    if (
      value.decision === "allow" &&
      value.security.promptInjectionRisk === "high"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["security", "promptInjectionRisk"],
        message: "allow decisions cannot have high prompt injection risk",
      });
    }

    if (
      value.decision === "allow" &&
      value.security.harmfulTechnicalIntent !== "none"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["security", "harmfulTechnicalIntent"],
        message: "allow decisions cannot have harmful technical intent",
      });
    }
  });

export { questionEligibilityGateSchema };

export type QuestionEligibilityGateResult = z.infer<
  typeof questionEligibilityGateSchema
>;
