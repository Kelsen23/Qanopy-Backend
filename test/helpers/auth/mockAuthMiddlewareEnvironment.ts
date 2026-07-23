import { vi } from "vitest";

type DecodedToken = {
  userId: string;
  tokenVersion?: number;
};

type AuthUser = {
  id: string;
  tokenVersion: number;
  status: string;
  isVerified: boolean;
  role: string;
  isDeleted: boolean;
};

const normalizeAuthUserResult = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const row = value as Record<string, unknown>;

  return {
    ...row,
    auth: row.auth ?? {
      tokenVersion: row.tokenVersion ?? 0,
      isVerified: row.isVerified ?? false,
    },
    statusState: row.statusState ?? {
      status: row.status ?? "ACTIVE",
      isDeleted: row.isDeleted ?? false,
    },
  };
};

const prismaUserFindUnique = vi.fn();
const prismaUserFindUniqueMockResolvedValue =
  prismaUserFindUnique.mockResolvedValue.bind(prismaUserFindUnique);
const prismaUserFindUniqueMockResolvedValueOnce =
  prismaUserFindUnique.mockResolvedValueOnce.bind(prismaUserFindUnique);
const redisStore = new Map<string, string>();
const jwtPayloads = new Map<string, DecodedToken>();

prismaUserFindUnique.mockResolvedValue = (value: unknown) =>
  prismaUserFindUniqueMockResolvedValue(normalizeAuthUserResult(value));
prismaUserFindUnique.mockResolvedValueOnce = (value: unknown) =>
  prismaUserFindUniqueMockResolvedValueOnce(normalizeAuthUserResult(value));

const redisGet = vi.fn(async (key: string) => redisStore.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: string) => {
  redisStore.set(key, value);
  return "OK";
});
const redisDel = vi.fn(async (key: string) => {
  redisStore.delete(key);
  return 1;
});

const jwtVerify = vi.fn((token: string) => {
  const payload = jwtPayloads.get(token);

  if (!payload) throw new Error("invalid token");

  return payload;
});

export const authMiddlewareEnvironment = {
  prismaUserFindUnique,
  redisStore,
  jwtPayloads,
  redisGet,
  redisSet,
  redisDel,
  jwtVerify,
};

export const resetAuthMiddlewareEnvironment = () => {
  redisStore.clear();
  jwtPayloads.clear();

  prismaUserFindUnique.mockReset();
  redisGet.mockClear();
  redisSet.mockClear();
  redisDel.mockClear();
  jwtVerify.mockClear();
};

export const seedJwtPayload = (token: string, payload: DecodedToken) => {
  jwtPayloads.set(token, payload);
};

export const seedRedisAuthUser = (user: AuthUser) => {
  redisStore.set(`auth:user:${user.id}`, JSON.stringify(user));
};

export const mockAuthMiddlewareModules = {
  jsonwebtoken: {
    default: {
      verify: jwtVerify,
      sign: vi.fn(),
    },
  },
  prismaConfig: {
    default: {
      user: {
        findUnique: prismaUserFindUnique,
      },
    },
  },
  redisConfig: {
    getRedisCacheClient: () => ({
      get: redisGet,
      set: redisSet,
      del: redisDel,
    }),
  },
};
