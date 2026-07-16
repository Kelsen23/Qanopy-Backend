import { z } from "zod";

const supportedProviders = [
  "openai",
  "anthropic",
  "openrouter",
  "voyage",
] as const;

const requiredString = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1, `${name} is required`);

const providerSchema = z.enum(supportedProviders);

const optionalProviderSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.toLowerCase() : undefined))
  .pipe(providerSchema.optional());

export {
  optionalProviderSchema,
  providerSchema,
  requiredString,
  supportedProviders,
};
