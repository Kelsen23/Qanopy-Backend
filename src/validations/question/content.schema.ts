import z from "zod";

import { Interest } from "../../generated/prisma/index.js";

import { hasMinimumBodyLengthAfterTempImageRemoval } from "../../utils/content/contentBodyValidation.util.js";

import { leoProfanity } from "./shared.js";

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

    if (!hasMinimumBodyLengthAfterTempImageRemoval(data.body, "QUESTION")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message:
          "Question body needs at least 20 characters of text besides images",
      });
    }
  });

const editQuestionSchema = createQuestionSchema;

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

    if (!hasMinimumBodyLengthAfterTempImageRemoval(data.body, "ANSWER")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Answer needs at least 20 characters of text besides images",
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

    if (!hasMinimumBodyLengthAfterTempImageRemoval(data.body, "REPLY")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Reply cannot contain only images",
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

export {
  createAnswerOnQuestionSchema,
  createQuestionSchema,
  createReplyOnAnswerSchema,
  editQuestionSchema,
  voteSchema,
};
