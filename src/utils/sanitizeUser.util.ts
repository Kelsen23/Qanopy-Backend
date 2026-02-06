import { User } from "../generated/prisma/index.js";

const sanitizeUser = (user: User) => {
  const {
    password,
    otp,
    otpResendAvailableAt,
    otpExpireAt,
    resetPasswordOtp,
    resetPasswordOtpVerified,
    resetPasswordOtpResendAvailableAt,
    resetPasswordOtpExpireAt,
    ...userWithoutSensitiveInfo
  } = user;

  return userWithoutSensitiveInfo;
};

export default sanitizeUser;
