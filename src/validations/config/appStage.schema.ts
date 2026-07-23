import { z } from "zod";

const appStageEnvSchema = z.object({
  STAGE: z
    .enum(["DEMO", "BETA", "ALPHA", "RELEASE"], "Invalid app stage")
    .default("DEMO"),
});

const appStageConfigSchema = appStageEnvSchema.transform((env) => ({
  registrationStage: env.STAGE,
}));

export { appStageConfigSchema, appStageEnvSchema };
