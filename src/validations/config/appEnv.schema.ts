import {
  authConfigSchema,
  emailIdentityConfigSchema,
  googleOAuthConfigSchema,
  nodemailerConfigSchema,
  prismaConfigSchema,
  redisConfigSchema,
  s3ConfigSchema,
  serverConfigSchema,
} from "./base.schema.js";
import { appStageEnvSchema } from "./appStage.schema.js";
import { creditEnvSchema } from "./credits.schema.js";
import {
  llmGatewayEnvSchema,
  validateLlmGatewayEnvRules,
} from "./llmGateway.schema.js";
import { mongodbEnvSchema } from "./mongodb.schema.js";

const appEnvSchema = serverConfigSchema
  .merge(appStageEnvSchema)
  .merge(authConfigSchema)
  .merge(googleOAuthConfigSchema)
  .merge(prismaConfigSchema)
  .merge(redisConfigSchema)
  .merge(nodemailerConfigSchema)
  .merge(emailIdentityConfigSchema)
  .merge(s3ConfigSchema)
  .merge(mongodbEnvSchema)
  .merge(creditEnvSchema)
  .merge(llmGatewayEnvSchema)
  .superRefine((env, ctx) => {
    validateLlmGatewayEnvRules(env, ctx);
  });

export { appEnvSchema };
