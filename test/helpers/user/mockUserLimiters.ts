const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

export const mockUserLimiters = {
  userProfilePictureUpdateLimiterMiddleware: passThrough,
  userProfilePictureDeleteLimiterMiddleware: passThrough,
  userProfileUpdateLimiterMiddleware: passThrough,
  userAccountDeletionLimiterMiddleware: passThrough,
  userNotificationSettingsLimiterMiddleware: passThrough,
  userEmailChangeSendLimiterMiddleware: passThrough,
  userEmailChangeResendLimiterMiddleware: passThrough,
  userEmailChangeVerifyLimiterMiddleware: passThrough,
  userNotificationsSeenLimiterMiddleware: passThrough,
};
