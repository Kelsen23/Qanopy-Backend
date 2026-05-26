import { User } from "../generated/prisma/index.js";

const sanitizeUser = (user: User) => {
  const {
    password,
    tokenVersion,
    otp,
    otpResendAvailableAt,
    otpExpireAt,
    resetPasswordOtp,
    resetPasswordOtpVerified,
    resetPasswordOtpResendAvailableAt,
    resetPasswordOtpExpireAt,
    emailChangePendingEmail,
    emailChangeOtp,
    emailChangeOtpResendAvailableAt,
    emailChangeOtpExpireAt,
    creditsLastRedeemedAt,
    deletedAt,
    accountDeletionRequestedAt,
    accountDeletionCompletedAt,
    ...userWithoutSensitiveInfo
  } = user;

  return userWithoutSensitiveInfo;
};

export default sanitizeUser;
