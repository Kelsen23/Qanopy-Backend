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
import {
  llmGatewayEnvSchema,
  validateLlmGatewayEnvRules,
} from "./llmGateway.schema.js";

const appEnvSchema = serverConfigSchema
  .merge(authConfigSchema)
  .merge(googleOAuthConfigSchema)
  .merge(prismaConfigSchema)
  .merge(redisConfigSchema)
  .merge(nodemailerConfigSchema)
  .merge(emailIdentityConfigSchema)
  .merge(s3ConfigSchema)
  .merge(llmGatewayEnvSchema)
  .superRefine((env, ctx) => {
    validateLlmGatewayEnvRules(env, ctx);
  });

export { appEnvSchema };
