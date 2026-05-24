const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

export const mockAuthLimiters = {
  registerLimiterMiddleware: passThrough,
  loginLimiterMiddleware: passThrough,
  oauthLimiterMiddleware: passThrough,
  emailVerificationLimiterMiddleware: passThrough,
  resendEmailLimiterMiddleware: passThrough,
  passwordResetLimiterMiddleware: passThrough,
  userEmailVerificationLimiterMiddleware: passThrough,
  userResendEmailLimiterMiddleware: passThrough,
  userPasswordChangeLimiterMiddleware: passThrough,
  sessionLimiterMiddleware: passThrough,
};
