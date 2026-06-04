type UsernameAvailabilityChecker = (username: string) => Promise<boolean>;

const buildDeletedUserData = async (
  userId: string,
  deletedAt = new Date(),
  isUsernameAvailable?: UsernameAvailabilityChecker,
) => {
  const suffix = userId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const baseUsername = `deleted_${suffix}`;
  let username = baseUsername;

  if (isUsernameAvailable) {
    let resolved = false;
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? baseUsername : `${baseUsername}_${i}`;
      if (await isUsernameAvailable(candidate)) {
        username = candidate;
        resolved = true;
        break;
      }
    }

    if (!resolved) {
      throw new Error("Unable to reserve a deleted username");
    }
  }

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
    emailChangePendingEmail: null,
    emailChangeOtp: null,
    emailChangeOtpResendAvailableAt: null,
    emailChangeOtpExpireAt: null,
    isVerified: false,
    authProvider: "LOCAL" as const,
    isDeleted: true,
    deletedAt,
  };
};

export default buildDeletedUserData;
