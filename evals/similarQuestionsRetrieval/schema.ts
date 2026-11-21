import z from "zod";

const nonEmptyTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Text must not be empty");

const uniqueStrings = (name: string) =>
  z
    .array(z.string().trim().min(1))
    .refine(
      (values) => new Set(values).size === values.length,
      `${name} must be unique`,
    );

const makeVersionIdentity = (questionId: string, version: number) =>
  JSON.stringify([questionId, version]);

const retrievalCorpusQuestionSchema = z
  .object({
    questionId: z.string().trim().min(1, "Question ID is required"),
    version: z.number().int().positive(),
    title: nonEmptyTextSchema,
    body: nonEmptyTextSchema,
    tags: uniqueStrings("Corpus tags"),
  })
  .strict();

const retrievalCorpusSchema = z
  .array(retrievalCorpusQuestionSchema)
  .refine((questions) => {
    const identities = questions.map(({ questionId, version }) =>
      makeVersionIdentity(questionId, version),
    );

    return new Set(identities).size === identities.length;
  }, "Corpus question/version identities must be unique");

const retrievalEvalSourceSchema = z
  .object({
    questionId: z.string().trim().min(1, "Source question ID is required"),
    version: z.number().int().positive(),
  })
  .strict();

const retrievalRelevanceGradeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const retrievalRelevanceJudgmentSchema = z
  .object({
    questionId: z.string().trim().min(1, "Relevant question ID is required"),
    version: z.number().int().positive(),
    grade: retrievalRelevanceGradeSchema,
  })
  .strict();

const retrievalEvalCaseSchema = z
  .object({
    id: z.string().trim().min(1, "Case ID is required"),
    description: z.string().trim().min(1, "Case description is required"),
    source: retrievalEvalSourceSchema,
    relevant: z.array(retrievalRelevanceJudgmentSchema),
    tags: uniqueStrings("Case tags"),
  })
  .strict()
  .refine(
    ({ relevant }) => relevant.some(({ grade }) => grade >= 2),
    "Eval case must contain at least one grade >= 2 target",
  )
  .refine(
    ({ source, relevant }) =>
      relevant.every(
        (judgment) =>
          judgment.questionId !== source.questionId ||
          judgment.version !== source.version,
      ),
    "Source question cannot be listed as a relevant target",
  )
  .refine(({ relevant }) => {
    const identities = relevant.map(({ questionId, version }) =>
      makeVersionIdentity(questionId, version),
    );

    return new Set(identities).size === identities.length;
  }, "Relevant question/version identities must be unique");

const retrievalEvalDatasetSchema = z
  .array(retrievalEvalCaseSchema)
  .refine((cases) => {
    const ids = cases.map(({ id }) => id);

    return new Set(ids).size === ids.length;
  }, "Retrieval eval case IDs must be unique")
  .refine((cases) => {
    const sourceIdentities = cases.map(({ source }) =>
      makeVersionIdentity(source.questionId, source.version),
    );

    return new Set(sourceIdentities).size === sourceIdentities.length;
  }, "Each source question/version may appear in only one similarQuestions retrieval eval case");

type RetrievalCorpusQuestion = z.infer<typeof retrievalCorpusQuestionSchema>;
type RetrievalCorpus = z.infer<typeof retrievalCorpusSchema>;
type RetrievalEvalSource = z.infer<typeof retrievalEvalSourceSchema>;
type RetrievalRelevanceGrade = z.infer<typeof retrievalRelevanceGradeSchema>;
type RetrievalRelevanceJudgment = z.infer<
  typeof retrievalRelevanceJudgmentSchema
>;
type RetrievalEvalCase = z.infer<typeof retrievalEvalCaseSchema>;
type RetrievalEvalDataset = z.infer<typeof retrievalEvalDatasetSchema>;

export {
  retrievalCorpusSchema,
  retrievalCorpusQuestionSchema,
  retrievalEvalCaseSchema,
  retrievalEvalDatasetSchema,
  retrievalEvalSourceSchema,
  retrievalRelevanceGradeSchema,
  retrievalRelevanceJudgmentSchema,
};

export type {
  RetrievalCorpus,
  RetrievalCorpusQuestion,
  RetrievalEvalCase,
  RetrievalEvalDataset,
  RetrievalEvalSource,
  RetrievalRelevanceGrade,
  RetrievalRelevanceJudgment,
};
