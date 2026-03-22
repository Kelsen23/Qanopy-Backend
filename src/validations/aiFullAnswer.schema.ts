import z from "zod";

const aiAnswerConfidenceSectionSchema = z
  .object({
    sectionName: z
      .string()
      .trim()
      .min(1, "Section name is required")
      .max(150, "Section name must be at most 150 characters"),
    confidence: z
      .number()
      .min(0, "Section confidence must be at least 0")
      .max(100, "Section confidence must be at most 100"),
    note: z
      .string()
      .trim()
      .min(1, "Section confidence note is required")
      .max(500, "Section confidence note must be at most 500 characters"),
  })
  .strict();

export const aiAnswerConfidenceSchema = z
  .object({
    overall: z
      .number()
      .min(0, "Overall confidence must be at least 0")
      .max(100, "Overall confidence must be at most 100"),
    note: z
      .string()
      .trim()
      .min(1, "Overall confidence note is required")
      .max(500, "Overall confidence note must be at most 500 characters"),
    sections: z.array(aiAnswerConfidenceSectionSchema).max(30),
  })
  .strict();

export const aiFullAnswerConfidenceResponseSchema = z
  .object({
    confidence: aiAnswerConfidenceSchema,
  })
  .strict();

const aiFullAnswerSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(20, "Answer body must be at least 20 characters")
      .max(20000, "Answer body must be at most 20000 characters"),
    confidence: aiAnswerConfidenceSchema,
  })
  .strict();

export default aiFullAnswerSchema;
