import { createRequire } from "module";

import z from "zod";

import { Interest } from "../generated/prisma/index.js";
import { hasMinimumBodyLengthAfterTempImageRemoval } from "../utils/content/contentBodyValidation.util.js";

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
  createQuestionSchema,
  editQuestionSchema,
  createAnswerOnQuestionSchema,
  createReplyOnAnswerSchema,
  voteSchema,
  generateSuggestionSchema,
  generateAiAnswerSchema,
  questionEligibilityGateSchema,
  publishAiAnswerSchema,
  unpublishAiAnswerSchema,
  createFeedbackOnAiAnswerSchema,
  editAiFeedbackSchema,
};

export type QuestionEligibilityGateResult = z.infer<
  typeof questionEligibilityGateSchema
>;
