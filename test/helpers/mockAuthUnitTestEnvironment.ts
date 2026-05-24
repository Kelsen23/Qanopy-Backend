import { vi } from "vitest";

type RedisEntry = string;

type BcryptCompareKey = `${string}::${string}`;

const redisStore = new Map<string, RedisEntry>();
const bcryptCompareResults = new Map<BcryptCompareKey, boolean>();

const prismaUserFindFirst = vi.fn();
const prismaUserFindUnique = vi.fn();
const prismaUserFindMany = vi.fn();
const prismaUserCreate = vi.fn();
const prismaUserUpdate = vi.fn();
const prismaUserDeleteMany = vi.fn();
const prismaUserDelete = vi.fn();
const prismaTransaction = vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
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

const verifyGoogleToken = vi.fn();
const generateOAuthUsername = vi.fn();
const makeUniqueJobId = vi.fn(() => "unique-job-id");
const verificationHtml = vi.fn(() => "<verification-email>");
const resetPasswordHtml = vi.fn(() => "<reset-password-email>");
const publishSocketDisconnect = vi.fn(async () => undefined);
const deleteSingleImageService = vi.fn(async () => undefined);
const buildDeletedUserData = vi.fn(async () => ({
  status: "DELETED",
  isDeleted: true,
}));
const clearNotificationCache = vi.fn(async () => undefined);
const cleanupExpiredUnverifiedUserById = vi.fn(async () => false);
const isExpiredUnverifiedLocalUser = vi.fn(() => false);

const notificationDeleteMany = vi.fn(async () => ({ count: 0 }));
const userInterestDeleteMany = vi.fn(async () => ({ count: 0 }));

const prismaMocks = {
  transactionClient: {
    user: {
      create: prismaUserCreate,
    },
  },
  user: {
    findFirst: prismaUserFindFirst,
    findUnique: prismaUserFindUnique,
    findMany: prismaUserFindMany,
    create: prismaUserCreate,
    update: prismaUserUpdate,
    deleteMany: prismaUserDeleteMany,
    delete: prismaUserDelete,
  },
  achievement: {
    deleteMany: prismaDeleteManyAchievement,
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
  verifyGoogleToken: {
    default: verifyGoogleToken,
  },
  generateOAuthUsername: {
    default: generateOAuthUsername,
  },
  makeJobId: {
    makeUniqueJobId,
  },
  renderTemplate: {
    verificationHtml,
    resetPasswordHtml,
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
  prismaUserFindMany,
  prismaUserCreate,
  prismaUserUpdate,
  prismaUserDeleteMany,
  prismaUserDelete,
  prismaTransaction,
  prismaFindUniqueByUsername,
  prismaDeleteManyGeneric,
  prismaDeleteManyNotificationSettings,
  prismaDeleteManyModerationStats,
  prismaDeleteManyBan,
  prismaDeleteManyWarning,
  prismaDeleteManyModerationStrike,
  prismaDeleteManyAchievement,
  redisGet,
  redisSet,
  redisDel,
  redisScan,
  redisMulti,
  redisMultiChain,
  bcryptHash,
  bcryptCompare,
  emailQueueAdd,
  verifyGoogleToken,
  generateOAuthUsername,
  makeUniqueJobId,
  verificationHtml,
  resetPasswordHtml,
  publishSocketDisconnect,
  deleteSingleImageService,
  buildDeletedUserData,
  clearNotificationCache,
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
  prismaUserFindMany.mockReset();
  prismaUserCreate.mockReset();
  prismaUserUpdate.mockReset();
  prismaUserDeleteMany.mockReset();
  prismaUserDelete.mockReset();
  prismaTransaction.mockClear();
  prismaFindUniqueByUsername.mockClear();
  prismaDeleteManyGeneric.mockClear();
  prismaDeleteManyNotificationSettings.mockClear();
  prismaDeleteManyModerationStats.mockClear();
  prismaDeleteManyBan.mockClear();
  prismaDeleteManyWarning.mockClear();
  prismaDeleteManyModerationStrike.mockClear();
  prismaDeleteManyAchievement.mockClear();

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
  verifyGoogleToken.mockReset();
  generateOAuthUsername.mockReset();
  makeUniqueJobId.mockReset();
  verificationHtml.mockReset();
  resetPasswordHtml.mockReset();
  publishSocketDisconnect.mockClear();
  deleteSingleImageService.mockClear();
  buildDeletedUserData.mockClear();
  clearNotificationCache.mockClear();
  cleanupExpiredUnverifiedUserById.mockClear();
  isExpiredUnverifiedLocalUser.mockClear();
  notificationDeleteMany.mockClear();
  userInterestDeleteMany.mockClear();
};

export const seedRedisValue = (key: string, value: unknown) => {
  redisStore.set(key, JSON.stringify(value));
};

export const seedBcryptCompareResult = (
  plain: string,
  hashed: string,
  result: boolean,
) => {
  bcryptCompareResults.set(`${plain}::${hashed}`, result);
};
