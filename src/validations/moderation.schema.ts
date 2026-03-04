import z from "zod";

const reportSchema = z.object({
  targetId: z.string(),
  targetUserId: z.string().uuid("Invalid targetUserId"),
  targetType: z.enum(["Question", "Answer", "Reply"], "Invalid targetType"),
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

const moderateSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(["Question", "Answer", "Reply"], "Invalid targetType"),
  reviewedBy: z.string().uuid("Invalid reviewedBy"),
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
    .max(365 * 24 * 60 * 60 * 1000, "Banning for more than 365 days not allowed")
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
