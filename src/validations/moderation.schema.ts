import z from "zod";

const reportSchema = z.object({
  targetId: z.string(),
  targetUserId: z.string().uuid("Invalid targetUserId"),
  targetType: z.enum(
    ["Question", "Answer", "Reply", "AiAnswerFeedback"],
    "Invalid targetType",
  ),
  reportReason: z.enum(
    [
      "SPAM",
      "HARASSMENT",
      "HATE_SPEECH",
      "INAPPROPRIATE_CONTENT",
      "MISINFORMATION",
      "OTHER",
    ],
    "Invalid reportReason",
  ),
  reportComment: z
    .string()
    .min(3, "Comment must be at least 3 characters")
    .max(150, "Comment must be at most 150 characters")
    .optional(),
});

const moderateSchema = z
  .object({
    type: z.enum(["Report", "Strike"]),
    targetId: z.string(),
    targetType: z.enum(
      ["Question", "Answer", "Reply", "AiAnswerFeedback"],
      "Invalid targetType",
    ),
    reviewComment: z
      .string()
      .max(500, "Review comment must be at most 500 characters")
      .optional(),
    actionTaken: z.enum(
      ["BAN_TEMP", "BAN_PERM", "WARN", "IGNORE"],
      "Invalid action",
    ),
    title: z
      .string()
      .min(5, "Title must be at least 5 characters")
      .max(80, "Title must be at most 80 characters"),
    reasons: z
      .array(
        z
          .string()
          .min(3, "A reason must be at least 3 characters")
          .max(150, "A reason must be at most 150 characters"),
      )
      .min(1, "There must be at least 1 reason")
      .max(5, "There must be at most 5 reasons"),
    banDurationMs: z
      .number()
      .int("Floats as banDurationMs not allowed")
      .min(1 * 60 * 60 * 1000, "Banning for less than 1 hour not allowed")
      .max(
        365 * 24 * 60 * 60 * 1000,
        "Banning for more than 365 days not allowed",
      )
      .optional(),
    warningDurationMs: z
      .number()
      .int("Floats as warningDurationMs not allowed")
      .min(
        1 * 60 * 60 * 1000,
        "Warning expiration duration with less than 1 hour not allowed",
      )
      .max(
        90 * 24 * 60 * 60 * 1000,
        "Warning expiration duration with more than 90 days not allowed",
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.actionTaken === "BAN_TEMP") {
      if (!data.banDurationMs) {
        ctx.addIssue({
          path: ["banDurationMs"],
          message: "banDurationMs required for BAN_TEMP",
          code: z.ZodIssueCode.custom,
        });
      }
    } else {
      if (data.banDurationMs) {
        ctx.addIssue({
          path: ["banDurationMs"],
          message: "banDurationMs only allowed for BAN_TEMP",
          code: z.ZodIssueCode.custom,
        });
      }
    }

    if (data.actionTaken === "WARN") {
      if (!data.warningDurationMs) {
        ctx.addIssue({
          path: ["warningDurationMs"],
          message: "warningDurationMs required for WARN",
          code: z.ZodIssueCode.custom,
        });
      }
    } else {
      if (data.warningDurationMs) {
        ctx.addIssue({
          path: ["warningDurationMs"],
          message: "warningDurationMs only allowed for WARN",
          code: z.ZodIssueCode.custom,
        });
      }
    }
  });

const moderateContentImageSchema = z.object({
  objectKey: z
    .string()
    .regex(
      /^temp\/content\/[a-f0-9-]+\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)$/i,
      "Invalid object key",
    ),
});

export { reportSchema, moderateSchema, moderateContentImageSchema };
