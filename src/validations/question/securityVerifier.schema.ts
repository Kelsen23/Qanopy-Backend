import z from "zod";

const securityVerifierSchema = z
  .object({
    finalSecurityDecision: z.enum([
      "allow",
      "allow_with_constraints",
      "reject",
    ]),
    promptInjection: z
      .object({
        detected: z.boolean(),
        risk: z.enum(["none", "low", "medium", "high"]),
        attackType: z.enum([
          "none",
          "direct_instruction_override",
          "system_prompt_extraction",
          "roleplay_jailbreak",
          "developer_mode",
          "hidden_or_encoded_instruction",
          "tool_abuse",
          "data_exfiltration",
          "quoted_untrusted_text",
          "indirect_prompt_injection",
          "other",
        ]),
        suspiciousText: z.array(z.string()),
      })
      .strict(),
    harmfulTechnicalIntent: z
      .object({
        detected: z.boolean(),
        category: z.enum([
          "none",
          "malware",
          "credential_theft",
          "phishing",
          "abuse_evasion",
          "unauthorized_access",
          "privacy_invasion",
          "spam_or_platform_abuse",
          "destructive_action",
          "cyber_dual_use",
          "other",
        ]),
        severity: z.enum(["none", "low", "medium", "high"]),
      })
      .strict(),
    downstreamPolicy: z
      .object({
        eligibleForDownstreamProcessing: z.boolean(),
        requireDefensiveFraming: z.boolean(),
        requireQuotedTextIsolation: z.boolean(),
      })
      .strict(),
    userFacingReason: z.string(),
    internalReason: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedEligibility = value.finalSecurityDecision !== "reject";

    if (
      value.downstreamPolicy.eligibleForDownstreamProcessing !==
      expectedEligibility
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["downstreamPolicy", "eligibleForDownstreamProcessing"],
        message:
          "eligibleForDownstreamProcessing must be false only when finalSecurityDecision is reject",
      });
    }

    if (
      value.finalSecurityDecision === "allow" &&
      (value.downstreamPolicy.requireDefensiveFraming ||
        value.downstreamPolicy.requireQuotedTextIsolation)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["downstreamPolicy"],
        message: "allow decisions cannot require downstream constraints",
      });
    }

    if (
      value.finalSecurityDecision === "allow_with_constraints" &&
      (!value.downstreamPolicy.requireDefensiveFraming ||
        !value.downstreamPolicy.requireQuotedTextIsolation)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["downstreamPolicy"],
        message:
          "allow_with_constraints decisions must require defensive framing and quoted-text isolation",
      });
    }
  });

export { securityVerifierSchema };

export type SecurityVerifierResult = z.infer<typeof securityVerifierSchema>;
