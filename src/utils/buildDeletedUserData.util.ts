const buildDeletedUserData = (userId: string, deletedAt = new Date()) => {
  const suffix = userId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const username = `deleted_${suffix}`;
  const email = `${username}@deleted.local`;

  return {
    username,
    displayName: "Deleted User",
    email,
    password: null,
    profilePictureUrl: null,
    profilePictureKey: null,
    bio: null,
    reputationPoints: 0,
    role: "USER" as const,
    questionsAsked: 0,
    answersGiven: 0,
    acceptedAnswers: 0,
    bestAnswers: 0,
    status: "TERMINATED" as const,
    credits: 0,
    creditsLastRedeemedAt: null,
    otp: null,
    otpResendAvailableAt: null,
    otpExpireAt: null,
    resetPasswordOtp: null,
    resetPasswordOtpVerified: null,
    resetPasswordOtpResendAvailableAt: null,
    resetPasswordOtpExpireAt: null,
    isVerified: false,
    authProvider: "LOCAL" as const,
    isDeleted: true,
    deletedAt,
  };
};

export default buildDeletedUserData;
