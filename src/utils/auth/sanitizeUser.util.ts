import type { FlattenedUser } from "../../services/user/userData.service.js";

const sanitizeUser = (user: FlattenedUser) => {
  const {
    auth,
    profile,
    stats,
    statusState,
    emailChange,
    password,
    authProvider,
    isVerified,
    tokenVersion,
    registeredStage,
    otp,
    otpResendAvailableAt,
    otpExpireAt,
    resetPasswordOtp,
    resetPasswordOtpVerified,
    resetPasswordOtpResendAvailableAt,
    resetPasswordOtpExpireAt,
    displayName,
    bio,
    profilePictureUrl,
    profilePictureKey,
    reputationPoints,
    questionsAsked,
    answersGiven,
    acceptedAnswers,
    bestAnswers,
    emailChangePendingEmail,
    emailChangeOtp,
    emailChangeOtpResendAvailableAt,
    emailChangeOtpExpireAt,
    status,
    isDeleted,
    deletedAt,
    accountDeletionRequestedAt,
    accountDeletionCompletedAt,
    ...userWithoutSensitiveInfo
  } = user;

  return {
    ...userWithoutSensitiveInfo,
    auth: {
      authProvider: auth?.authProvider ?? authProvider,
      isVerified: auth?.isVerified ?? isVerified,
    },
    profile: {
      displayName: profile?.displayName ?? displayName ?? null,
      bio: profile?.bio ?? bio ?? null,
      profilePictureUrl:
        profile?.profilePictureUrl ?? profilePictureUrl ?? null,
      profilePictureKey:
        profile?.profilePictureKey ?? profilePictureKey ?? null,
    },
    stats: {
      reputationPoints: stats?.reputationPoints ?? reputationPoints ?? 0,
      questionsAsked: stats?.questionsAsked ?? questionsAsked ?? 0,
      answersGiven: stats?.answersGiven ?? answersGiven ?? 0,
      acceptedAnswers: stats?.acceptedAnswers ?? acceptedAnswers ?? 0,
      bestAnswers: stats?.bestAnswers ?? bestAnswers ?? 0,
    },
    statusState: {
      status: statusState?.status ?? status ?? "ACTIVE",
      isDeleted: statusState?.isDeleted ?? isDeleted ?? false,
    },
  };
};

export default sanitizeUser;
