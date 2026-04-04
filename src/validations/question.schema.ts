import { createRequire } from "module";

import z from "zod";

import { Interest } from "../generated/prisma/index.js";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

const createQuestionSchema = z
  .object({
    title: z
      .string()
      .min(10, "Title must be at least 10 characters")
      .max(150, "Title must be at most 150 characters"),
    body: z
      .string()
      .min(20, "Body must be at least 20 characters")
      .max(20000, "Body must be at most 20000 characters"),
    tags: z.array(z.nativeEnum(Interest)),
  })
  .superRefine((data, ctx) => {
    if (leoProfanity.check(data.title)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Title contains inappropriate language",
      });
    }

    if (leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Question contains inappropriate language",
      });
    }
  });

const createAnswerOnQuestionSchema = z
  .object({
    body: z
      .string()
      .min(20, "Answer must be at least 20 characters")
      .max(20000, "Answer must be at most 20000 characters"),
  })
  .superRefine((data, ctx) => {
    if (leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Answer contains inappropriate language",
      });
    }
  });

const createReplyOnAnswerSchema = z
  .object({
    body: z
      .string()
      .min(1, "Reply must be at least 1 character")
      .max(150, "Reply must be at most 150 characters"),
  })
  .superRefine((data, ctx) => {
    if (leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Reply contains inappropriate language",
      });
    }
  });

const voteSchema = z.object({
  targetType: z.enum(
    ["QUESTION", "ANSWER", "REPLY"],
    "Target type is either 'QUESTION', 'ANSWER' or 'REPLY'",
  ),
  targetId: z.string().min(1, "targetId is required"),
  voteType: z.enum(
    ["UPVOTE", "DOWNVOTE"],
    "Vote type must be either 'UPVOTE' or 'DOWNVOTE'",
  ),
});

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
  });

const editAiFeedbackSchema = z
  .object({
    feedbackId: z.string().min(1, "feedbackId is required"),
    type: z.enum(["HELPFUL", "NOT_HELPFUL"]),
    body: z
      .string()
      .min(1, "Feedback body must be at least 1 character")
      .max(150, "Feedback body must be at most 150 characters"),
  })
  .superRefine((data, ctx) => {
    if (data.body && leoProfanity.check(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Feedback contains inappropriate language",
      });
    }
  });

const deleteAiFeedbackSchema = z.object({
  feedbackId: z.string().min(1, "feedbackId is required"),
});

export {
  createQuestionSchema,
  createAnswerOnQuestionSchema,
  createReplyOnAnswerSchema,
  voteSchema,
  generateSuggestionSchema,
  generateAiAnswerSchema,
  publishAiAnswerSchema,
  unpublishAiAnswerSchema,
  createFeedbackOnAiAnswerSchema,
  editAiFeedbackSchema,
  deleteAiFeedbackSchema,
};
