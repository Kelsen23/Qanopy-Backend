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
  sendResetPasswordEmail,
  verifyEmail,
  verifyResetPasswordOtp,
} from "../controllers/auth.controller.js";

import isAuthenticated from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  loginSchema,
  oauthSchema,
  registerSchema,
  resetPasswordSchema,
  sendResetPasswordEmailSchema,
  verifyEmailSchema,
} from "../validations/auth.schema.js";

import {
  emailVerificationLimiterMiddleware,
  loginLimiterMiddleware,
  registerLimiterMiddleware,
  resendEmailLimiterMiddleware,
  resetPasswordLimiterMiddleware,
  generalLimiterMiddleware,
} from "../middlewares/rate-limiters/auth.rate-limiters.js";

const router = express.Router();

router
  .route("/register")
  .post(registerLimiterMiddleware, validate(registerSchema), register);
router
  .route("/login")
  .post(loginLimiterMiddleware, validate(loginSchema), login);
router
  .route("/registerOrLogin")
  .post(registerLimiterMiddleware, validate(oauthSchema), registerOrLogin);

router
  .route("/email/verify")
  .post(
    emailVerificationLimiterMiddleware,
    isAuthenticated,
    validate(verifyEmailSchema),
    verifyEmail,
  );
router
  .route("/verificationEmail/resend")
  .post(resendEmailLimiterMiddleware, isAuthenticated, resendVerificationEmail);

router
  .route("/resetPasswordEmail/send")
  .post(
    resetPasswordLimiterMiddleware,
    validate(sendResetPasswordEmailSchema),
    sendResetPasswordEmail,
  );
router
  .route("/resetPasswordEmail/resend")
  .post(
    resendEmailLimiterMiddleware,
    validate(sendResetPasswordEmailSchema),
    resendResetPasswordEmail,
  );
router
  .route("/resetPasswordOtp/verify")
  .post(
    emailVerificationLimiterMiddleware,
    validate(verifyEmailSchema),
    verifyResetPasswordOtp,
  );
router
  .route("/password/reset")
  .post(
    resetPasswordLimiterMiddleware,
    validate(resetPasswordSchema),
    resetPassword,
  );

router.route("/isAuth").get(generalLimiterMiddleware, isAuthenticated, isAuth);

router.route("/logout").post(generalLimiterMiddleware, isAuthenticated, logout);

export default router;
