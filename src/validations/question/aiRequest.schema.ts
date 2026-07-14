import z from "zod";

import { hasMinimumBodyLengthAfterTempImageRemoval } from "../../utils/content/contentBodyValidation.util.js";

import { leoProfanity } from "./shared.js";

const generateSuggestionSchema = z.object({
  version: z.coerce
    .number()
    .int("version must be an integer")
    .positive("version must be greater than 0"),
});

const generateAiAnswerSchema = z.object({
  version: z.coerce
    .number()
    .int("version must be an integer")
    .positive("version must be greater than 0"),
});

const publishAiAnswerSchema = z.object({
  aiAnswerId: z.string().min(1, "aiAnswerId is required"),
});

const unpublishAiAnswerSchema = z.object({
  aiAnswerId: z.string().min(1, "aiAnswerId is required"),
});

const createFeedbackOnAiAnswerSchema = z
  .object({
    aiAnswerId: z.string().min(1, "aiAnswerId is required"),
    type: z.enum(["HELPFUL", "NOT_HELPFUL"]),
    body: z
      .string()
      .min(1, "Feedback body must be at least 1 character")
      .max(150, "Feedback body must be at most 150 characters")
      .optional(),
    questionVersionAtFeedback: z.coerce
      .number()
      .int("questionVersionAtFeedback must be an integer")
      .positive("questionVersionAtFeedback must be greater than 0"),
  })
  .superRefine((data, ctx) => {
    if (data.body && leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Feedback contains inappropriate language",
      });
    }

    if (
      data.body &&
      !hasMinimumBodyLengthAfterTempImageRemoval(
        data.body,
        "AI_ANSWER_FEEDBACK",
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Feedback cannot contain only images",
      });
    }
  });

const editAiFeedbackSchema = z
  .object({
    feedbackId: z.string().min(1, "feedbackId is required"),
    type: z.enum(["HELPFUL", "NOT_HELPFUL"]),
    body: z
      .string()
      .min(1, "Feedback body must be at least 1 character")
      .max(150, "Feedback body must be at most 150 characters"),
    questionVersionAtFeedback: z.coerce
      .number()
      .int("questionVersionAtFeedback must be an integer")
      .positive("questionVersionAtFeedback must be greater than 0"),
  })
  .superRefine((data, ctx) => {
    if (data.body && leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Feedback contains inappropriate language",
      });
    }

    if (
      !hasMinimumBodyLengthAfterTempImageRemoval(
        data.body,
        "AI_ANSWER_FEEDBACK",
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Feedback cannot contain only images",
      });
    }
  });

export {
  createFeedbackOnAiAnswerSchema,
  editAiFeedbackSchema,
  generateAiAnswerSchema,
  generateSuggestionSchema,
  publishAiAnswerSchema,
  unpublishAiAnswerSchema,
};
