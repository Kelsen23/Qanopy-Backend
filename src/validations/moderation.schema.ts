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

const moderateReportSchema = z.object({
  title: z.string().max(30, "Title must be at most 30 characters"),
  actionTaken: z.enum(
    ["BAN_USER_TEMP", "BAN_USER_PERM", "WARN_USER", "IGNORE"],
    "Invalid action",
  ),
  adminReasons: z.array(
    z
      .string()
      .min(3, "A reason must be at least 3 characters")
      .max(150, "A reason must be at most 150 characters"),
  ),
  severity: z
    .number()
    .min(0, "Severity mus be from 0 to 100")
    .max(100, "Severity mus be from 0 to 100"),
  banDurationMs: z
    .number()
    .min(1 * 60 * 60 * 1000, "Banning for less than 1 hour not allowed")
    .max(30 * 24 * 60 * 60 * 1000, "Banning for more than 30 days not allowed")
    .optional(),
});

const moderateContentImageSchema = z.object({
  objectKey: z.string().nonempty("objectKey is required"),
});

export { reportSchema, moderateReportSchema, moderateContentImageSchema };
