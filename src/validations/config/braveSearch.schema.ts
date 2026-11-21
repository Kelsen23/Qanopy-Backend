import { z } from "zod";

const braveSearchEnvSchema = z.object({
  BRAVE_API_KEY: z.string().trim().min(1),
});

const braveSearchConfigSchema = braveSearchEnvSchema.transform((env) => ({
  apiKey: env.BRAVE_API_KEY,
}));

export { braveSearchConfigSchema, braveSearchEnvSchema };
