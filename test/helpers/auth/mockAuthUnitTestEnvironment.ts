import { vi } from "vitest";

type RedisEntry = string;

type BcryptCompareKey = `${string}::${string}`;
type MockCallback = (tx: typeof prismaMocks.transactionClient) => Promise<unknown>;

const normalizeUserResult = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const row = value as Record<string, unknown>;

  return {
    ...row,
    auth: row.auth ?? {
      password: row.password ?? null,
      authProvider: row.authProvider ?? "LOCAL",
      isVerified: row.isVerified ?? false,
      tokenVersion: row.tokenVersion ?? 0,
      otp: row.otp ?? null,
      otpResendAvailableAt: row.otpResendAvailableAt ?? null,
      otpExpireAt: row.otpExpireAt ?? null,
      resetPasswordOtp: row.resetPasswordOtp ?? null,
      resetPasswordOtpVerified: row.resetPasswordOtpVerified ?? null,
      resetPasswordOtpResendAvailableAt:
        row.resetPasswordOtpResendAvailableAt ?? null,
      resetPasswordOtpExpireAt: row.resetPasswordOtpExpireAt ?? null,
    },
    profile: row.profile ?? {
      displayName: row.displayName ?? null,
      bio: row.bio ?? null,
      profilePictureUrl: row.profilePictureUrl ?? null,
      profilePictureKey: row.profilePictureKey ?? null,
    },
    stats: row.stats ?? {
      reputationPoints: row.reputationPoints ?? 0,
      questionsAsked: row.questionsAsked ?? 0,
      answersGiven: row.answersGiven ?? 0,
      acceptedAnswers: row.acceptedAnswers ?? 0,
      bestAnswers: row.bestAnswers ?? 0,
      registeredStage: row.registeredStage ?? "DEMO",
    },
    statusState: row.statusState ?? {
      status: row.status ?? "ACTIVE",
      isDeleted: row.isDeleted ?? false,
      deletedAt: row.deletedAt ?? null,
      accountDeletionRequestedAt: row.accountDeletionRequestedAt ?? null,
      accountDeletionCompletedAt: row.accountDeletionCompletedAt ?? null,
    },
    emailChange: row.emailChange ?? {
      pendingEmail: row.emailChangePendingEmail ?? null,
      otp: row.emailChangeOtp ?? null,
      otpExpireAt: row.emailChangeOtpExpireAt ?? null,
      otpResendAvailableAt: row.emailChangeOtpResendAvailableAt ?? null,
    },
  };
};

const normalizeResolvedUserMock = () => {
  const mock = vi.fn();
  const mockResolvedValue = mock.mockResolvedValue.bind(mock);
  const mockResolvedValueOnce = mock.mockResolvedValueOnce.bind(mock);

  mock.mockResolvedValue = (value: unknown) =>
    mockResolvedValue(normalizeUserResult(value));
  mock.mockResolvedValueOnce = (value: unknown) =>
    mockResolvedValueOnce(normalizeUserResult(value));

  return mock;
};

const redisStore = new Map<string, RedisEntry>();
const bcryptCompareResults = new Map<BcryptCompareKey, boolean>();

const prismaUserFindFirst = normalizeResolvedUserMock();
const prismaUserFindUnique = normalizeResolvedUserMock();
const prismaUserFindUniqueOrThrow = normalizeResolvedUserMock();
const prismaUserFindMany = vi.fn();
const prismaUserCreate = normalizeResolvedUserMock();
const prismaUserUpdate = normalizeResolvedUserMock();
const prismaUserUpdateMockResolvedValue =
  prismaUserUpdate.mockResolvedValue.bind(prismaUserUpdate);
const prismaUserUpdateMockResolvedValueOnce =
  prismaUserUpdate.mockResolvedValueOnce.bind(prismaUserUpdate);
const prismaUserDeleteMany = vi.fn();
const prismaUserDelete = vi.fn();
const prismaUserAuthUpdate = vi.fn();
const prismaUserProfileUpdate = vi.fn();
const prismaUserStatsUpdate = vi.fn();
const prismaUserStatusUpdate = vi.fn();
const prismaUserEmailChangeUpdate = vi.fn();
const prismaCreditPeriodUsageDeleteMany = vi.fn();
const prismaCreditOperationDeleteMany = vi.fn();
const prismaTransaction = vi.fn(async (cb: MockCallback) =>
  cb(prismaMocks.transactionClient),
);
const prismaFindUniqueByUsername = vi.fn();
const prismaDeleteManyGeneric = vi.fn();
const prismaDeleteManyNotificationSettings = vi.fn();
const prismaDeleteManyModerationStats = vi.fn();
const prismaDeleteManyBan = vi.fn();
const prismaDeleteManyWarning = vi.fn();
const prismaDeleteManyModerationStrike = vi.fn();
const prismaDeleteManyAchievement = vi.fn();
const prismaDeleteManyUserBadge = vi.fn();

prismaUserUpdate.mockResolvedValue = (value: unknown) => {
  prismaUserFindUniqueOrThrow.mockResolvedValue(value);
  return prismaUserUpdateMockResolvedValue(normalizeUserResult(value));
};
prismaUserUpdate.mockResolvedValueOnce = (value: unknown) => {
  prismaUserFindUniqueOrThrow.mockResolvedValueOnce(value);
  return prismaUserUpdateMockResolvedValueOnce(normalizeUserResult(value));
};

const redisGet = vi.fn(async (key: string) => redisStore.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: string) => {
  redisStore.set(key, value);
  return "OK";
});
const redisDel = vi.fn(async (...keys: string[]) => {
  keys.forEach((key) => redisStore.delete(key));
  return keys.length;
});
const redisScan = vi.fn(async () => ["0", []] as const);

const redisMultiChain = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(async () => []),
};
const redisMulti = vi.fn(() => redisMultiChain);

const bcryptHash = vi.fn(
  async (value: string, rounds: number) => `hashed:${value}:${rounds}`,
);
const bcryptCompare = vi.fn(async (value: string, hashed: string) => {
  const seeded = bcryptCompareResults.get(`${value}::${hashed}`);
  return seeded ?? value === hashed;
});

const emailQueueAdd = vi.fn(async () => ({
  id: "job-id",
}));
const queueBadgeAward = vi.fn(async () => undefined);

const verifyGoogleToken = vi.fn();
const generateOAuthUsername = vi.fn();
const makeJobId = vi.fn((...parts: unknown[]) => parts.join("__"));
const makeUniqueJobId = vi.fn(() => "unique-job-id");
const verificationHtml = vi.fn(() => "<verification-email>");
const resetPasswordHtml = vi.fn(() => "<reset-password-email>");
const securityNoticeHtml = vi.fn(() => "<security-notice-email>");
const emailChangeHtml = vi.fn(() => "<email-change-email>");
const publishSocketDisconnect = vi.fn(async () => undefined);
const deleteSingleImageService = vi.fn(async () => undefined);
const buildDeletedUserData = vi.fn(async () => ({
  status: "DELETED",
  isDeleted: true,
}));
const clearNotificationCache = vi.fn(async () => undefined);
const clearUserBadgesCache = vi.fn(async () => undefined);
const clearReportsCache = vi.fn(async () => undefined);
const clearStrikesCache = vi.fn(async () => undefined);
const clearModerationCachesForUser = vi.fn(async () => undefined);
const cleanupExpiredUnverifiedUserById = vi.fn(async () => false);
const isExpiredUnverifiedLocalUser = vi.fn(() => false);

const notificationDeleteMany = vi.fn(async () => ({ count: 0 }));
const userInterestDeleteMany = vi.fn(async () => ({ count: 0 }));

const prismaMocks = {
  transactionClient: {
    user: {
      create: prismaUserCreate,
      update: prismaUserUpdate,
      findUnique: prismaUserFindUnique,
      findUniqueOrThrow: prismaUserFindUniqueOrThrow,
    },
    userAuth: {
      update: prismaUserUpdate,
    },
    userProfile: {
      update: prismaUserProfileUpdate,
    },
    userStats: {
      update: prismaUserStatsUpdate,
    },
    userStatus: {
      update: prismaUserStatusUpdate,
    },
    userEmailChange: {
      update: prismaUserEmailChangeUpdate,
    },
  },
  user: {
    findFirst: prismaUserFindFirst,
    findUnique: prismaUserFindUnique,
    findUniqueOrThrow: prismaUserFindUniqueOrThrow,
    findMany: prismaUserFindMany,
    create: prismaUserCreate,
    update: prismaUserUpdate,
    deleteMany: prismaUserDeleteMany,
    delete: prismaUserDelete,
  },
  achievement: {
    deleteMany: prismaDeleteManyAchievement,
  },
  userBadge: {
    deleteMany: prismaDeleteManyUserBadge,
  },
  moderationStrike: {
    deleteMany: prismaDeleteManyModerationStrike,
  },
  warning: {
    deleteMany: prismaDeleteManyWarning,
  },
  ban: {
    deleteMany: prismaDeleteManyBan,
  },
  moderationStats: {
    deleteMany: prismaDeleteManyModerationStats,
  },
  notificationSettings: {
    deleteMany: prismaDeleteManyNotificationSettings,
  },
  userAuth: {
    update: prismaUserUpdate,
  },
  userProfile: {
    update: prismaUserProfileUpdate,
  },
  userStats: {
    update: prismaUserStatsUpdate,
  },
  userStatus: {
    update: prismaUserStatusUpdate,
  },
  userEmailChange: {
    update: prismaUserEmailChangeUpdate,
  },
  creditPeriodUsage: {
    deleteMany: prismaCreditPeriodUsageDeleteMany,
  },
  creditOperation: {
    deleteMany: prismaCreditOperationDeleteMany,
  },
  $transaction: prismaTransaction,
};

export const mockAuthUnitModules = {
  prismaConfig: {
    default: prismaMocks,
  },
  redisConfig: {
    getRedisCacheClient: () => ({
      get: redisGet,
      set: redisSet,
      del: redisDel,
      multi: redisMulti,
      scan: redisScan,
    }),
    redisMessagingClientConnection: {},
  },
  bcrypt: {
    default: {
      hash: bcryptHash,
      compare: bcryptCompare,
    },
  },
  emailQueue: {
    default: {
      add: emailQueueAdd,
    },
  },
  queueBadgeAwardService: {
    default: queueBadgeAward,
  },
  verifyGoogleToken: {
    default: verifyGoogleToken,
  },
  generateOAuthUsername: {
    default: generateOAuthUsername,
  },
  makeJobId: {
    makeJobId,
    makeUniqueJobId,
  },
  renderTemplate: {
    verificationHtml,
    resetPasswordHtml,
    securityNoticeHtml,
    emailChangeHtml,
  },
  publishSocketDisconnect: {
    default: publishSocketDisconnect,
  },
  deleteSingleImageService: {
    default: deleteSingleImageService,
  },
  buildDeletedUserData: {
    default: buildDeletedUserData,
  },
  unverifiedAccountCleanup: {
    cleanupExpiredUnverifiedUserById,
    isExpiredUnverifiedLocalUser,
  },
  clearCacheUtil: {
    clearNotificationCache,
    clearUserBadgesCache,
    clearReportsCache,
    clearStrikesCache,
  },
  clearModerationCacheUtil: {
    default: clearModerationCachesForUser,
  },
  notificationModel: {
    default: {
      deleteMany: notificationDeleteMany,
    },
  },
  userInterestModel: {
    default: {
      deleteMany: userInterestDeleteMany,
    },
  },
};

export const mockAuthUnitTestEnvironment = {
  redisStore,
  bcryptCompareResults,
  prismaUserFindFirst,
  prismaUserFindUnique,
  prismaUserFindUniqueOrThrow,
  prismaUserFindMany,
  prismaUserCreate,
  prismaUserUpdate,
  prismaUserDeleteMany,
  prismaUserDelete,
  prismaUserAuthUpdate,
  prismaUserProfileUpdate,
  prismaUserStatsUpdate,
  prismaUserStatusUpdate,
  prismaUserEmailChangeUpdate,
  prismaCreditPeriodUsageDeleteMany,
  prismaCreditOperationDeleteMany,
  prismaTransaction,
  prismaFindUniqueByUsername,
  prismaDeleteManyGeneric,
  prismaDeleteManyNotificationSettings,
  prismaDeleteManyModerationStats,
  prismaDeleteManyBan,
  prismaDeleteManyWarning,
  prismaDeleteManyModerationStrike,
  prismaDeleteManyAchievement,
  prismaDeleteManyUserBadge,
  redisGet,
  redisSet,
  redisDel,
  redisScan,
  redisMulti,
  redisMultiChain,
  bcryptHash,
  bcryptCompare,
  emailQueueAdd,
  queueBadgeAward,
  verifyGoogleToken,
  generateOAuthUsername,
  makeJobId,
  makeUniqueJobId,
  verificationHtml,
  resetPasswordHtml,
  securityNoticeHtml,
  emailChangeHtml,
  publishSocketDisconnect,
  deleteSingleImageService,
  buildDeletedUserData,
  clearNotificationCache,
  clearUserBadgesCache,
  clearModerationCachesForUser,
  cleanupExpiredUnverifiedUserById,
  isExpiredUnverifiedLocalUser,
  notificationDeleteMany,
  userInterestDeleteMany,
};

export const resetAuthUnitTestEnvironment = () => {
  redisStore.clear();
  bcryptCompareResults.clear();

  prismaUserFindFirst.mockReset();
  prismaUserFindUnique.mockReset();
  prismaUserFindUniqueOrThrow.mockReset();
  prismaUserFindMany.mockReset();
  prismaUserCreate.mockReset();
  prismaUserUpdate.mockReset();
  prismaUserDeleteMany.mockReset();
  prismaUserDelete.mockReset();
  prismaUserAuthUpdate.mockReset();
  prismaUserProfileUpdate.mockReset();
  prismaUserStatsUpdate.mockReset();
  prismaUserStatusUpdate.mockReset();
  prismaUserEmailChangeUpdate.mockReset();
  prismaCreditPeriodUsageDeleteMany.mockReset();
  prismaCreditOperationDeleteMany.mockReset();
  prismaTransaction
    .mockReset()
    .mockImplementation(async (cb: MockCallback) =>
      cb(prismaMocks.transactionClient),
    );
  prismaFindUniqueByUsername.mockClear();
  prismaDeleteManyGeneric.mockClear();
  prismaDeleteManyNotificationSettings.mockClear();
  prismaDeleteManyModerationStats.mockClear();
  prismaDeleteManyBan.mockClear();
  prismaDeleteManyWarning.mockClear();
  prismaDeleteManyModerationStrike.mockClear();
  prismaDeleteManyAchievement.mockClear();
  prismaDeleteManyUserBadge.mockClear();

  redisGet
    .mockReset()
    .mockImplementation(async (key: string) => redisStore.get(key) ?? null);
  redisSet
    .mockReset()
    .mockImplementation(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    });
  redisDel.mockReset().mockImplementation(async (...keys: string[]) => {
    keys.forEach((key) => redisStore.delete(key));
    return keys.length;
  });
  redisScan.mockReset().mockImplementation(async () => ["0", []] as const);
  redisMulti.mockReset().mockImplementation(() => redisMultiChain);
  redisMultiChain.incr.mockClear();
  redisMultiChain.expire.mockClear();
  redisMultiChain.exec.mockClear();

  bcryptHash.mockClear();
  bcryptCompare.mockClear();

  emailQueueAdd.mockClear();
  queueBadgeAward.mockClear();
  verifyGoogleToken.mockReset();
  generateOAuthUsername.mockReset();
  makeJobId
    .mockReset()
    .mockImplementation((...parts: unknown[]) => parts.join("__"));
  makeUniqueJobId.mockReset();
  verificationHtml.mockReset();
  resetPasswordHtml.mockReset();
  securityNoticeHtml.mockReset();
  emailChangeHtml.mockReset();
  publishSocketDisconnect.mockClear();
  deleteSingleImageService.mockClear();
  buildDeletedUserData.mockClear();
  clearNotificationCache.mockClear();
  clearUserBadgesCache.mockClear();
  clearReportsCache.mockClear();
  clearStrikesCache.mockClear();
  clearModerationCachesForUser.mockClear();
  cleanupExpiredUnverifiedUserById.mockClear();
  isExpiredUnverifiedLocalUser.mockClear();
  notificationDeleteMany.mockClear();
  userInterestDeleteMany.mockClear();
};

export const seedRedisValue = (key: string, value: unknown) => {
  redisStore.set(key, JSON.stringify(value));
};

export const seedBcryptCompareResult = (
  value: string,
  hashed: string,
  result: boolean,
) => {
  bcryptCompareResults.set(`${value}::${hashed}`, result);
};
