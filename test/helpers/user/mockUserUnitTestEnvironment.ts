import { vi } from "vitest";

type RedisEntry = string;
type BcryptCompareKey = `${string}::${string}`;

const redisStore = new Map<string, RedisEntry>();
const bcryptCompareResults = new Map<BcryptCompareKey, boolean>();
const s3SendResponses: unknown[] = [];

const prismaUserFindUnique = vi.fn();
const prismaUserFindFirst = vi.fn();
const prismaUserUpdate = vi.fn();
const prismaUserUpdateMany = vi.fn();
const prismaNotificationSettingsUpsert = vi.fn();
const prismaBadgeFindFirst = vi.fn();
const prismaBadgeFindMany = vi.fn();
const prismaUserBadgeUpsert = vi.fn();
const prismaUserBadgeFindMany = vi.fn();

const redisGet = vi.fn(async (key: string) => redisStore.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: unknown) => {
  redisStore.set(key, String(value));
  return "OK";
});
const redisDel = vi.fn(async (...keys: string[]) => {
  keys.forEach((key) => redisStore.delete(key));
  return keys.length;
});
const redisMultiChain = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(async () => []),
};
const redisMulti = vi.fn(() => redisMultiChain);

const imageModerationQueueAdd = vi.fn(async () => ({ id: "image-job-id" }));
const imageDeletionQueueAdd = vi.fn(async () => ({
  id: "image-delete-job-id",
}));
const accountDeletionQueueAdd = vi.fn(async () => ({
  id: "account-delete-job-id",
}));
const emailQueueAdd = vi.fn(async () => ({ id: "email-job-id" }));
const badgeQueueAdd = vi.fn(async () => ({ id: "badge-job-id" }));

const makeJobId = vi.fn((...parts: unknown[]) => parts.join("__"));
const makeUniqueJobId = vi.fn(
  (...parts: unknown[]) => `unique__${parts.join("__")}`,
);
const emailChangeHtml = vi.fn(() => "<email-change-email>");
const securityNoticeHtml = vi.fn(() => "<security-notice-email>");
const buildDeletedUserData = vi.fn(async () => ({
  username: "deleted-user",
  email: "deleted@example.com",
  status: "DELETED",
  isDeleted: true,
  deletedAt: new Date("2026-01-01T00:00:00.000Z"),
}));
const publishSocketDisconnect = vi.fn(async () => undefined);
const clearNotificationCache = vi.fn(async () => undefined);
const clearUserBadgesCache = vi.fn(async () => undefined);
const clearReportsCache = vi.fn(async () => undefined);
const clearStrikesCache = vi.fn(async () => undefined);
const cacheUser = vi.fn(async () => undefined);
const cacheAuthUser = vi.fn(async () => undefined);
const moveS3Object = vi.fn(async () => true);
const moderateFileService = vi.fn(async () => ({ safe: true }));
const handleExpiredUnverifiedUser = vi.fn(async () => false);
const getDeviceIp = vi.fn(() => "127.0.0.1");
const removeEmailChangeAttempts = vi.fn(async () => undefined);
const getBadgeRulesForTrigger = vi.fn();

const bcryptHash = vi.fn(
  async (value: string, rounds: number) => `hashed:${value}:${rounds}`,
);
const bcryptCompare = vi.fn(async (value: string, hashed: string) => {
  const seeded = bcryptCompareResults.get(`${value}::${hashed}`);
  return seeded ?? value === hashed;
});

const notificationUpdateMany = vi.fn(async () => ({ modifiedCount: 0 }));
const s3Send = vi.fn(async () => {
  if (s3SendResponses.length > 0) {
    const next = s3SendResponses.shift();
    if (next instanceof Error) throw next;
    return next;
  }

  return {};
});

const prismaMocks = {
  user: {
    findUnique: prismaUserFindUnique,
    findFirst: prismaUserFindFirst,
    update: prismaUserUpdate,
    updateMany: prismaUserUpdateMany,
  },
  notificationSettings: {
    upsert: prismaNotificationSettingsUpsert,
  },
  badge: {
    findFirst: prismaBadgeFindFirst,
    findMany: prismaBadgeFindMany,
  },
  userBadge: {
    upsert: prismaUserBadgeUpsert,
    findMany: prismaUserBadgeFindMany,
  },
};

export const mockUserUnitModules = {
  prismaConfig: {
    default: prismaMocks,
  },
  redisConfig: {
    getRedisCacheClient: () => ({
      get: redisGet,
      set: redisSet,
      del: redisDel,
      multi: redisMulti,
    }),
    redisMessagingClientConnection: {},
  },
  bcrypt: {
    default: {
      hash: bcryptHash,
      compare: bcryptCompare,
    },
  },
  imageModerationQueue: {
    default: {
      add: imageModerationQueueAdd,
    },
  },
  imageDeletionQueue: {
    default: {
      add: imageDeletionQueueAdd,
    },
  },
  accountDeletionQueue: {
    default: {
      add: accountDeletionQueueAdd,
    },
  },
  emailQueue: {
    default: {
      add: emailQueueAdd,
    },
  },
  badgeQueue: {
    default: {
      add: badgeQueueAdd,
    },
  },
  makeJobId: {
    makeJobId,
    makeUniqueJobId,
  },
  renderTemplate: {
    emailChangeHtml,
    securityNoticeHtml,
  },
  buildDeletedUserData: {
    default: buildDeletedUserData,
  },
  publishSocketDisconnect: {
    default: publishSocketDisconnect,
  },
  clearCacheUtil: {
    clearNotificationCache,
    clearUserBadgesCache,
    clearReportsCache,
    clearStrikesCache,
  },
  authShared: {
    cacheUser,
    cacheAuthUser,
    getDeviceIp,
    handleExpiredUnverifiedUser,
  },
  moveS3Object: {
    default: moveS3Object,
  },
  moderateFileService: {
    default: moderateFileService,
  },
  s3Config: {
    default: () => ({
      send: s3Send,
    }),
    bucketName: "test-bucket",
    cloudfrontDomain: "https://cdn.example.com",
  },
  notificationModel: {
    default: {
      updateMany: notificationUpdateMany,
    },
  },
  emailChangeShared: {
    EMAIL_CHANGE_OTP_ATTEMPTS_TTL_SECONDS: 120,
    getEmailChangeAttemptsKey: (userId: string) =>
      `user:email-change:attempts:${userId}`,
    removeEmailChangeAttempts,
  },
  badgeRulesIndex: {
    getBadgeRulesForTrigger,
  },
};

export const mockUserUnitTestEnvironment = {
  redisStore,
  bcryptCompareResults,
  s3SendResponses,
  prismaUserFindUnique,
  prismaUserFindFirst,
  prismaUserUpdate,
  prismaUserUpdateMany,
  prismaNotificationSettingsUpsert,
  prismaBadgeFindFirst,
  prismaBadgeFindMany,
  prismaUserBadgeUpsert,
  prismaUserBadgeFindMany,
  redisGet,
  redisSet,
  redisDel,
  redisMulti,
  redisMultiChain,
  imageModerationQueueAdd,
  imageDeletionQueueAdd,
  accountDeletionQueueAdd,
  emailQueueAdd,
  badgeQueueAdd,
  makeJobId,
  makeUniqueJobId,
  emailChangeHtml,
  securityNoticeHtml,
  buildDeletedUserData,
  publishSocketDisconnect,
  clearNotificationCache,
  clearUserBadgesCache,
  clearReportsCache,
  clearStrikesCache,
  cacheUser,
  cacheAuthUser,
  moveS3Object,
  moderateFileService,
  handleExpiredUnverifiedUser,
  getDeviceIp,
  removeEmailChangeAttempts,
  getBadgeRulesForTrigger,
  bcryptHash,
  bcryptCompare,
  notificationUpdateMany,
  s3Send,
};

export const resetUserUnitTestEnvironment = () => {
  redisStore.clear();
  bcryptCompareResults.clear();
  s3SendResponses.length = 0;

  prismaUserFindUnique.mockReset();
  prismaUserFindFirst.mockReset();
  prismaUserUpdate.mockReset();
  prismaUserUpdateMany.mockReset();
  prismaNotificationSettingsUpsert.mockReset();
  prismaBadgeFindFirst.mockReset();
  prismaBadgeFindMany.mockReset();
  prismaUserBadgeUpsert.mockReset();
  prismaUserBadgeFindMany.mockReset();

  redisGet
    .mockReset()
    .mockImplementation(async (key: string) => redisStore.get(key) ?? null);
  redisSet
    .mockReset()
    .mockImplementation(async (key: string, value: unknown) => {
      redisStore.set(key, String(value));
      return "OK";
    });
  redisDel.mockReset().mockImplementation(async (...keys: string[]) => {
    keys.forEach((key) => redisStore.delete(key));
    return keys.length;
  });
  redisMulti.mockReset().mockImplementation(() => redisMultiChain);
  redisMultiChain.incr.mockClear();
  redisMultiChain.expire.mockClear();
  redisMultiChain.exec.mockClear();

  imageModerationQueueAdd.mockReset().mockResolvedValue({ id: "image-job-id" });
  imageDeletionQueueAdd
    .mockReset()
    .mockResolvedValue({ id: "image-delete-job-id" });
  accountDeletionQueueAdd
    .mockReset()
    .mockResolvedValue({ id: "account-delete-job-id" });
  emailQueueAdd.mockReset().mockResolvedValue({ id: "email-job-id" });
  badgeQueueAdd.mockReset().mockResolvedValue({ id: "badge-job-id" });

  makeJobId
    .mockReset()
    .mockImplementation((...parts: unknown[]) => parts.join("__"));
  makeUniqueJobId
    .mockReset()
    .mockImplementation((...parts: unknown[]) => `unique__${parts.join("__")}`);
  emailChangeHtml.mockReset().mockReturnValue("<email-change-email>");
  securityNoticeHtml.mockReset().mockReturnValue("<security-notice-email>");
  buildDeletedUserData.mockReset().mockResolvedValue({
    username: "deleted-user",
    email: "deleted@example.com",
    status: "DELETED",
    isDeleted: true,
    deletedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  publishSocketDisconnect.mockClear();
  clearNotificationCache.mockClear();
  clearUserBadgesCache.mockClear();
  clearReportsCache.mockClear();
  clearStrikesCache.mockClear();
  cacheUser.mockClear();
  cacheAuthUser.mockClear();
  moveS3Object.mockReset().mockResolvedValue(true);
  moderateFileService.mockReset().mockResolvedValue({ safe: true });
  handleExpiredUnverifiedUser.mockReset().mockResolvedValue(false);
  getDeviceIp.mockReset().mockReturnValue("127.0.0.1");
  removeEmailChangeAttempts.mockClear();
  getBadgeRulesForTrigger.mockReset();
  bcryptHash.mockClear();
  bcryptCompare.mockClear();
  notificationUpdateMany.mockClear();
  s3Send.mockReset().mockImplementation(async () => {
    if (s3SendResponses.length > 0) {
      const next = s3SendResponses.shift();
      if (next instanceof Error) throw next;
      return next;
    }

    return {};
  });
};

export const seedRedisValue = (key: string, value: unknown) => {
  redisStore.set(
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  );
};

export const seedBcryptCompareResult = (
  value: string,
  hashed: string,
  result: boolean,
) => {
  bcryptCompareResults.set(`${value}::${hashed}`, result);
};

export const queueS3SendResult = (value: unknown) => {
  s3SendResponses.push(value);
};

export const queueS3SendError = (error: Error) => {
  s3SendResponses.push(error);
};
