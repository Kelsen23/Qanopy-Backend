import { z } from "zod";

const optionalPositiveIntEnvSchema = (name: string, fallback: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return fallback;

      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: "custom",
          message: `${name} must be a positive integer`,
        });

        return z.NEVER;
      }

      return parsed;
    });

const creditEnvSchema = z.object({
  DAILY_CREDIT_LIMIT: optionalPositiveIntEnvSchema("DAILY_CREDIT_LIMIT", 400),
  WEEKLY_CREDIT_LIMIT: optionalPositiveIntEnvSchema(
    "WEEKLY_CREDIT_LIMIT",
    1600,
  ),
});

const creditConfigSchema = creditEnvSchema.transform((env) => ({
  dailyLimit: env.DAILY_CREDIT_LIMIT,
  weeklyLimit: env.WEEKLY_CREDIT_LIMIT,
}));

export { creditConfigSchema, creditEnvSchema };
