import { z } from "zod";

import { requiredString } from "./shared.js";

const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const serverConfigSchema = z.object({
  MONGO_URI: requiredString("MONGO_URI"),
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().positive().default(5000),
});

const authConfigSchema = z.object({
  JWT_SECRET: requiredString("JWT_SECRET"),
});

const googleOAuthConfigSchema = z.object({
  GOOGLE_CLIENT_ID: requiredString("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requiredString("GOOGLE_CLIENT_SECRET"),
});

const redisConfigSchema = z.object({
  REDIS_CACHE_URL: requiredString("REDIS_CACHE_URL"),
  REDIS_MESSAGING_URL: requiredString("REDIS_MESSAGING_URL"),
});

const s3ConfigSchema = z.object({
  BUCKET_NAME: requiredString("BUCKET_NAME"),
  BUCKET_REGION: requiredString("BUCKET_REGION"),
  ACCESS_KEY: requiredString("ACCESS_KEY"),
  SECRET_ACCESS_KEY: requiredString("SECRET_ACCESS_KEY"),
  CLOUDFRONT_DOMAIN: requiredString("CLOUDFRONT_DOMAIN"),
});

const nodemailerConfigSchema = z.object({
  SMTP_HOST: requiredString("SMTP_HOST"),
  SENDER_EMAIL: requiredString("SENDER_EMAIL"),
  SENDER_PASS: requiredString("SENDER_PASS"),
});

const emailIdentityConfigSchema = z.object({
  QANOPY_EMAIL: requiredString("QANOPY_EMAIL"),
  SUPPORT_EMAIL: requiredString("SUPPORT_EMAIL"),
});

const prismaConfigSchema = z.object({
  DATABASE_URL: requiredString("DATABASE_URL"),
  DIRECT_URL: requiredString("DIRECT_URL"),
});

export {
  authConfigSchema,
  emailIdentityConfigSchema,
  googleOAuthConfigSchema,
  nodemailerConfigSchema,
  nodeEnvSchema,
  prismaConfigSchema,
  redisConfigSchema,
  s3ConfigSchema,
  serverConfigSchema,
};
