import z from "zod";

import { Interest } from "../generated/prisma/index.js";

const aiSuggestionSchema = z
  .object({
    suggestions: z.object({
      title: z
        .string()
        .min(10, "Title must be at least 10 characters")
        .max(150, "Title must be at most 150 characters"),
      body: z
        .string()
        .min(20, "Body must be at least 20 characters")
        .max(20000, "Body must be at most 20000 characters"),
      tags: z
        .array(z.nativeEnum(Interest))
        .min(1, "At least one tag is required"),
    }),
    notes: z.array(z.string()),
    confidence: z
      .number()
      .min(0, "Confidence must be at least 0")
      .max(1, "Confidence must be at most 1"),
  })
  .strict();

export default aiSuggestionSchema;
