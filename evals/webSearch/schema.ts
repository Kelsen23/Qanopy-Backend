import z from "zod";

import {
  webSearchEvidenceSchema,
  webSearchToolInputSchema,
} from "../../src/validations/question/aiAnswer/webSearch.schema.js";

const uniqueStringArray = (name: string) =>
  z
    .array(z.string().trim().min(1))
    .refine((values) => new Set(values).size === values.length, {
      message: `${name} must be unique`,
    });

const webSearchEvalInputSchema = webSearchToolInputSchema;

const webSearchReferenceFactSchema = z
  .object({
    id: z.string().trim().min(1),
    claim: z.string().trim().min(1),
    critical: z.boolean(),
  })
  .strict();

const webSearchEvalAssertionsSchema = z
  .object({
    referenceFacts: z.array(webSearchReferenceFactSchema).min(1),
    requirePassageEvidence: z.boolean(),
  })
  .strict()
  .superRefine(({ referenceFacts }, ctx) => {
    const ids = referenceFacts.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceFacts"],
        message: "Reference fact IDs must be unique within a case",
      });
    }
  });

const webSearchEvalCaseSchema = z
  .object({
    id: z.string().trim().min(1),
    description: z.string().trim().min(1),
    input: webSearchEvalInputSchema,
    assertions: webSearchEvalAssertionsSchema,
    scenarioTags: uniqueStringArray("Scenario tags"),
  })
  .strict();

const webSearchEvalCaseSetSchema = z
  .array(webSearchEvalCaseSchema)
  .refine((cases) => {
    const ids = cases.map(({ id }) => id);
    return new Set(ids).size === ids.length;
  }, "Web search eval case IDs must be unique");

const webSearchEvalEvidenceSchema = webSearchEvidenceSchema;

const webSearchResultJudgmentSchema = z
  .object({
    rank: z.number().int().positive(),
    relevanceGrade: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    authorityGrade: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    supportedFactIds: uniqueStringArray("Supported fact IDs"),
  })
  .strict();

const webSearchEvalJudgeResultSchema = z
  .object({
    caseId: z.string().trim().min(1),
    resultJudgments: z.array(webSearchResultJudgmentSchema),
    unsupportedFactIds: uniqueStringArray("Unsupported fact IDs"),
  })
  .strict();

const webSearchEvalJudgeBatchSchema = z
  .object({
    judgments: z.array(webSearchEvalJudgeResultSchema).min(1),
  })
  .strict()
  .superRefine(({ judgments }, ctx) => {
    const caseIds = judgments.map(({ caseId }) => caseId);
    if (new Set(caseIds).size !== caseIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["judgments"],
        message: "Each web search eval case may appear only once per batch",
      });
    }
  });

type WebSearchEvalInput = z.infer<typeof webSearchEvalInputSchema>;
type WebSearchReferenceFact = z.infer<typeof webSearchReferenceFactSchema>;
type WebSearchEvalAssertions = z.infer<typeof webSearchEvalAssertionsSchema>;
type WebSearchEvalCase = z.infer<typeof webSearchEvalCaseSchema>;
type WebSearchEvalCaseSet = z.infer<typeof webSearchEvalCaseSetSchema>;
type WebSearchEvalEvidence = z.infer<typeof webSearchEvalEvidenceSchema>;
type WebSearchResultJudgment = z.infer<typeof webSearchResultJudgmentSchema>;
type WebSearchEvalJudgeResult = z.infer<typeof webSearchEvalJudgeResultSchema>;
type WebSearchEvalJudgeBatchResult = z.infer<
  typeof webSearchEvalJudgeBatchSchema
>;

export {
  webSearchEvalInputSchema,
  webSearchReferenceFactSchema,
  webSearchEvalAssertionsSchema,
  webSearchEvalCaseSchema,
  webSearchEvalCaseSetSchema,
  webSearchEvalEvidenceSchema,
  webSearchResultJudgmentSchema,
  webSearchEvalJudgeResultSchema,
  webSearchEvalJudgeBatchSchema,
};

export type {
  WebSearchEvalInput,
  WebSearchReferenceFact,
  WebSearchEvalAssertions,
  WebSearchEvalCase,
  WebSearchEvalCaseSet,
  WebSearchEvalEvidence,
  WebSearchResultJudgment,
  WebSearchEvalJudgeResult,
  WebSearchEvalJudgeBatchResult,
};
