import type {
  AuthProvider,
  Status,
  User,
  UserAuth,
  UserEmailChange,
  UserProfile,
  UserStats,
  UserStatus,
} from "../../generated/prisma/client.js";

import prisma from "../../config/prisma.config.js";

type UserWithNormalizedData = User & {
  auth?: UserAuth | null;
  profile?: UserProfile | null;
  stats?: UserStats | null;
  statusState?: UserStatus | null;
  emailChange?: UserEmailChange | null;
};

type FlattenedUser = UserWithNormalizedData & {
  password: string | null;
  authProvider: AuthProvider;
  isVerified: boolean;
  tokenVersion: number;
  otp: string | null;
  otpResendAvailableAt: Date | null;
  otpExpireAt: Date | null;
  resetPasswordOtp: string | null;
  resetPasswordOtpVerified: boolean | null;
  resetPasswordOtpResendAvailableAt: Date | null;
  resetPasswordOtpExpireAt: Date | null;
  displayName: string | null;
  bio: string | null;
  profilePictureUrl: string | null;
  profilePictureKey: string | null;
  reputationPoints: number;
  questionsAsked: number;
  answersGiven: number;
  acceptedAnswers: number;
  bestAnswers: number;
  registeredStage: string;
  status: Status;
  isDeleted: boolean;
  deletedAt: Date | null;
  accountDeletionRequestedAt: Date | null;
  accountDeletionCompletedAt: Date | null;
  emailChangePendingEmail: string | null;
  emailChangeOtp: string | null;
  emailChangeOtpResendAvailableAt: Date | null;
  emailChangeOtpExpireAt: Date | null;
};

const normalizedUserInclude = {
  auth: true,
  profile: true,
  stats: true,
  statusState: true,
  emailChange: true,
} as const;

const flattenUser = (user: UserWithNormalizedData): FlattenedUser => ({
  ...user,
  password: user.auth?.password ?? null,
  authProvider: user.auth?.authProvider ?? "LOCAL",
  isVerified: user.auth?.isVerified ?? false,
  tokenVersion: user.auth?.tokenVersion ?? 0,
  otp: user.auth?.otp ?? null,
  otpResendAvailableAt: user.auth?.otpResendAvailableAt ?? null,
  otpExpireAt: user.auth?.otpExpireAt ?? null,
  resetPasswordOtp: user.auth?.resetPasswordOtp ?? null,
  resetPasswordOtpVerified: user.auth?.resetPasswordOtpVerified ?? null,
  resetPasswordOtpResendAvailableAt:
    user.auth?.resetPasswordOtpResendAvailableAt ?? null,
  resetPasswordOtpExpireAt: user.auth?.resetPasswordOtpExpireAt ?? null,
  displayName: user.profile?.displayName ?? null,
  bio: user.profile?.bio ?? null,
  profilePictureUrl: user.profile?.profilePictureUrl ?? null,
  profilePictureKey: user.profile?.profilePictureKey ?? null,
  reputationPoints: user.stats?.reputationPoints ?? 0,
  questionsAsked: user.stats?.questionsAsked ?? 0,
  answersGiven: user.stats?.answersGiven ?? 0,
  acceptedAnswers: user.stats?.acceptedAnswers ?? 0,
  bestAnswers: user.stats?.bestAnswers ?? 0,
  registeredStage: user.stats?.registeredStage ?? "DEMO",
  status: user.statusState?.status ?? "ACTIVE",
  isDeleted: user.statusState?.isDeleted ?? false,
  deletedAt: user.statusState?.deletedAt ?? null,
  accountDeletionRequestedAt:
    user.statusState?.accountDeletionRequestedAt ?? null,
  accountDeletionCompletedAt:
    user.statusState?.accountDeletionCompletedAt ?? null,
  emailChangePendingEmail: user.emailChange?.pendingEmail ?? null,
  emailChangeOtp: user.emailChange?.otp ?? null,
  emailChangeOtpResendAvailableAt:
    user.emailChange?.otpResendAvailableAt ?? null,
  emailChangeOtpExpireAt: user.emailChange?.otpExpireAt ?? null,
});

const getFlattenedUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: normalizedUserInclude,
  });

  return user ? flattenUser(user) : null;
};

const getFlattenedUsersByIds = async (userIds: string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: normalizedUserInclude,
  });

  return users.map(flattenUser);
};

const getFlattenedUserByEmail = async (email: string) => {
  const user = await prisma.user.findFirst({
    where: { email, statusState: { isDeleted: false } },
    include: normalizedUserInclude,
  });

  return user ? flattenUser(user) : null;
};

const getFlattenedUserByUsername = async (username: string) => {
  const user = await prisma.user.findUnique({
    where: { username },
    include: normalizedUserInclude,
  });

  return user ? flattenUser(user) : null;
};

const createUserDefaults = ({
  registeredStage,
  authProvider = "LOCAL",
  isVerified = false,
  password,
  profilePictureUrl,
}: {
  registeredStage: string;
  authProvider?: AuthProvider;
  isVerified?: boolean;
  password?: string | null;
  profilePictureUrl?: string | null;
}) => ({
  auth: {
    create: {
      authProvider,
      isVerified,
      password,
    },
  },
  profile: {
    create: {
      profilePictureUrl,
    },
  },
  stats: {
    create: {
      registeredStage,
    },
  },
  statusState: {
    create: {},
  },
  emailChange: {
    create: {},
  },
  creditPeriodUsages: {
    create: [
      {
        periodType: "DAILY" as const,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      {
        periodType: "WEEKLY" as const,
        resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    ],
  },
  moderationStats: { create: {} },
  notificationSettings: { create: {} },
});

export type { FlattenedUser, UserWithNormalizedData };
export {
  createUserDefaults,
  flattenUser,
  getFlattenedUserByEmail,
  getFlattenedUserById,
  getFlattenedUserByUsername,
  getFlattenedUsersByIds,
  normalizedUserInclude,
};
