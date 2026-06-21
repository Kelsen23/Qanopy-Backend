import z from "zod";

const reportTargetTypeSchema = z.enum(
  ["QUESTION", "ANSWER", "REPLY", "AI_ANSWER_FEEDBACK"],
  "Invalid targetType",
);

const reportReasonSchema = z.enum(
  [
    "SPAM",
    "HARASSMENT",
    "HATE_SPEECH",
    "INAPPROPRIATE_CONTENT",
    "MISINFORMATION",
    "OTHER",
  ],
  "Invalid reportReason",
);

const moderationTypeSchema = z.enum(["REPORT", "STRIKE"]);

const moderationActionTakenSchema = z.enum(
  ["BAN_TEMP", "BAN_PERM", "WARN", "IGNORE"],
  "Invalid action",
);

const targetIdSchema = z.string().min(1, "targetId is required");
const targetContentVersionSchema = z
  .number()
  .int("targetContentVersion must be an integer")
  .min(1, "targetContentVersion must be at least 1");

const optionalReportCommentSchema = z
  .string()
  .trim()
  .min(3, "Comment must be at least 3 characters")
  .max(150, "Comment must be at most 150 characters")
  .optional();

const optionalReviewCommentSchema = z
  .string()
  .trim()
  .min(3, "Review comment must be at least 3 characters")
  .max(150, "Review comment must be at most 150 characters")
  .optional();

const moderationTitleSchema = z
  .string()
  .trim()
  .min(5, "Title must be at least 5 characters")
  .max(80, "Title must be at most 80 characters");

const moderationReasonSchema = z
  .string()
  .trim()
  .min(3, "A reason must be at least 3 characters")
  .max(150, "A reason must be at most 150 characters");

const banDurationMsSchema = z
  .number()
  .int("Floats as banDurationMs not allowed")
  .min(1 * 60 * 60 * 1000, "Banning for less than 1 hour not allowed")
  .max(365 * 24 * 60 * 60 * 1000, "Banning for more than 365 days not allowed");

const warningDurationMsSchema = z
  .number()
  .int("Floats as warningDurationMs not allowed")
  .min(
    1 * 60 * 60 * 1000,
    "Warning expiration duration with less than 1 hour not allowed",
  )
  .max(
    90 * 24 * 60 * 60 * 1000,
    "Warning expiration duration with more than 90 days not allowed",
  );

const contentImageObjectKeySchema = z
  .string()
  .regex(
    /^temp\/content\/[a-f0-9-]+\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)$/i,
    "Invalid object key",
  );

const reportSchema = z
  .object({
    targetId: targetIdSchema,
    targetType: reportTargetTypeSchema,
    targetContentVersion: targetContentVersionSchema.optional(),
    reportReason: reportReasonSchema,
    reportComment: optionalReportCommentSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.targetType === "QUESTION" &&
      data.targetContentVersion === undefined
    ) {
      ctx.addIssue({
        path: ["targetContentVersion"],
        message: "targetContentVersion is required for QUESTION reports",
        code: z.ZodIssueCode.custom,
      });
    }

    if (
      data.targetType !== "QUESTION" &&
      data.targetContentVersion !== undefined
    ) {
      ctx.addIssue({
        path: ["targetContentVersion"],
        message: "targetContentVersion is only allowed for QUESTION reports",
        code: z.ZodIssueCode.custom,
      });
    }
  });

const moderateSchema = z
  .object({
    type: moderationTypeSchema,
    targetId: targetIdSchema,
    reviewComment: optionalReviewCommentSchema,
    actionTaken: moderationActionTakenSchema,
    title: moderationTitleSchema,
    reasons: z
      .array(moderationReasonSchema)
      .min(1, "There must be at least 1 reason")
      .max(5, "There must be at most 5 reasons"),
    banDurationMs: banDurationMsSchema.optional(),
    warningDurationMs: warningDurationMsSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.actionTaken === "BAN_TEMP" && data.banDurationMs === undefined) {
      ctx.addIssue({
        path: ["banDurationMs"],
        message: "banDurationMs required for BAN_TEMP",
        code: z.ZodIssueCode.custom,
      });
    }

    if (data.actionTaken !== "BAN_TEMP" && data.banDurationMs !== undefined) {
      ctx.addIssue({
        path: ["banDurationMs"],
        message: "banDurationMs only allowed for BAN_TEMP",
        code: z.ZodIssueCode.custom,
      });
    }

    if (data.actionTaken === "WARN" && data.warningDurationMs === undefined) {
      ctx.addIssue({
        path: ["warningDurationMs"],
        message: "warningDurationMs required for WARN",
        code: z.ZodIssueCode.custom,
      });
    }

    if (data.actionTaken !== "WARN" && data.warningDurationMs !== undefined) {
      ctx.addIssue({
        path: ["warningDurationMs"],
        message: "warningDurationMs only allowed for WARN",
        code: z.ZodIssueCode.custom,
      });
    }
  });

const removeBanSchema = z
  .object({
    userId: targetIdSchema,
  })
  .strict();

export {
  reportSchema,
  moderateSchema,
  removeBanSchema,
  reportTargetTypeSchema,
  reportReasonSchema,
  moderationTypeSchema,
  moderationActionTakenSchema,
  targetIdSchema,
  contentImageObjectKeySchema,
};
