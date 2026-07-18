import z from "zod";

import { profileUsernameSchema } from "../utils/user/profileFieldValidation.util.js";

const isDeletedEmail = (email: string) =>
  email.toLowerCase().endsWith("@deleted.local");

const activeEmailSchema = z
  .string()
  .email("Invalid email address")
  .min(5, "Email must be at least 5 characters")
  .max(345, "Email must be at most 345 characters")
  .refine((email) => !isDeletedEmail(email), {
    message: "This email address is reserved",
  });

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(60, "Password must be at most 60 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(
    /[^a-zA-Z]/,
    "Password must contain at least one non-letter character",
  );

const otpSchema = z.string().length(6, "OTP should be exactly 6 characters");

const usernameSchema = profileUsernameSchema;

const registerSchema = z.object({
  username: usernameSchema,
  email: activeEmailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: activeEmailSchema,
  password: passwordSchema,
});

const googleOauthSchema = z.object({
  provider: z.literal("google"),
  id_token: z.string(),
});

const githubOauthSchema = z.object({
  provider: z.literal("github"),
  access_token: z.string(),
});

const verifyEmailSchema = z.object({
  otp: otpSchema,
});

const sendResetPasswordEmailSchema = z.object({
  email: activeEmailSchema,
});

const verifyResetPasswordOtpSchema = z.object({
  email: activeEmailSchema,
  otp: otpSchema,
});

const resetPasswordSchema = z.object({
  email: activeEmailSchema,
  newPassword: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export {
  activeEmailSchema,
  passwordSchema,
  otpSchema,
  usernameSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  sendResetPasswordEmailSchema,
  verifyResetPasswordOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
};

export const oauthSchema = z.discriminatedUnion("provider", [
  googleOauthSchema,
  githubOauthSchema,
]);
