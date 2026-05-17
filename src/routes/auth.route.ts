import express from "express";

import {
  isAuth,
  login,
  logout,
  register,
  registerOrLogin,
  resendResetPasswordEmail,
  resendVerificationEmail,
  resetPassword,
  changePassword,
  sendResetPasswordEmail,
  verifyEmail,
  verifyResetPasswordOtp,
} from "../controllers/auth.controller.js";

import isAuthenticated from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
  emailVerificationLimiterMiddleware,
  loginLimiterMiddleware,
  oauthLimiterMiddleware,
  registerLimiterMiddleware,
  resendEmailLimiterMiddleware,
  passwordResetLimiterMiddleware,
  sessionLimiterMiddleware,
  userEmailVerificationLimiterMiddleware,
  userPasswordChangeLimiterMiddleware,
  userResendEmailLimiterMiddleware,
} from "../middlewares/rate-limiters/auth.rate-limiters.js";

import {
  changePasswordSchema,
  loginSchema,
  oauthSchema,
  registerSchema,
  resetPasswordSchema,
  sendResetPasswordEmailSchema,
  verifyEmailSchema,
  verifyResetPasswordOtpSchema,
} from "../validations/auth.schema.js";

const router = express.Router();

router
  .route("/register")
  .post(registerLimiterMiddleware, validate(registerSchema), register);

router
  .route("/login")
  .post(loginLimiterMiddleware, validate(loginSchema), login);

router
  .route("/oauth")
  .post(oauthLimiterMiddleware, validate(oauthSchema), registerOrLogin);

router
  .route("/email/verify")
  .post(
    isAuthenticated,
    userEmailVerificationLimiterMiddleware,
    validate(verifyEmailSchema),
    verifyEmail,
  );

router
  .route("/email/resend")
  .post(
    isAuthenticated,
    userResendEmailLimiterMiddleware,
    resendVerificationEmail,
  );

router
  .route("/password/reset/send")
  .post(
    passwordResetLimiterMiddleware,
    validate(sendResetPasswordEmailSchema),
    sendResetPasswordEmail,
  );

router
  .route("/password/reset/resend")
  .post(
    resendEmailLimiterMiddleware,
    validate(sendResetPasswordEmailSchema),
    resendResetPasswordEmail,
  );

router
  .route("/password/reset/verify")
  .post(
    emailVerificationLimiterMiddleware,
    validate(verifyResetPasswordOtpSchema),
    verifyResetPasswordOtp,
  );

router
  .route("/password/reset")
  .post(
    passwordResetLimiterMiddleware,
    validate(resetPasswordSchema),
    resetPassword,
  );

router
  .route("/password/change")
  .post(
    isAuthenticated,
    userPasswordChangeLimiterMiddleware,
    validate(changePasswordSchema),
    changePassword,
  );

router.route("/session").get(sessionLimiterMiddleware, isAuthenticated, isAuth);

router
  .route("/session")
  .post(sessionLimiterMiddleware, isAuthenticated, logout);

export default router;
