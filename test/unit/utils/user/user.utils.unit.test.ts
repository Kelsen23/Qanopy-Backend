import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaUserUpdate = vi.fn();
const prismaExecuteRaw = vi.fn();
const prismaTransaction = vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
  cb({
    user: {
      update: prismaUserUpdate,
    },
    $executeRaw: prismaExecuteRaw,
  }),
);
const redisDel = vi.fn(async (...keys: string[]) => keys.length);
const clearReportsCache = vi.fn(async () => undefined);
const clearStrikesCache = vi.fn(async () => undefined);
const s3Send = vi.fn();

vi.mock("../../../../src/config/prisma.config.js", () => ({
  default: {
    $transaction: prismaTransaction,
  },
}));
vi.mock("../../../../src/config/redis.config.js", () => ({
  getRedisCacheClient: () => ({
    del: redisDel,
  }),
}));
vi.mock("../../../../src/utils/cache/clearCache.util.js", () => ({
  clearReportsCache,
  clearStrikesCache,
}));
vi.mock("../../../../src/config/s3.config.js", () => ({
  default: () => ({
    send: s3Send,
  }),
  bucketName: "bucket",
}));
vi.mock("@aws-sdk/client-s3", () => ({
  HeadObjectCommand: function HeadObjectCommand(input: unknown) {
    return input;
  },
  CopyObjectCommand: function CopyObjectCommand(input: unknown) {
    return input;
  },
  DeleteObjectCommand: function DeleteObjectCommand(input: unknown) {
    return input;
  },
}));

const { default: updateUserStats } = await import(
  "../../../../src/utils/user/updateUserStats.util.js"
);
const { default: clearModerationCachesForUser } = await import(
  "../../../../src/utils/cache/clearModerationCachesForUser.util.js"
);
const { default: clearUserCache } = await import(
  "../../../../src/utils/cache/clearUserCache.util.js"
);
const { default: getObjectKeyFromUrl } = await import(
  "../../../../src/utils/media/getObjectKeyFromUrl.util.js"
);
const { default: moveS3Object } = await import(
  "../../../../src/utils/media/moveS3Object.util.js"
);

describe("user utils", () => {
  beforeEach(() => {
    prismaUserUpdate.mockReset();
    prismaExecuteRaw.mockReset();
    prismaTransaction
      .mockReset()
      .mockImplementation(async (cb: (tx: any) => Promise<unknown>) =>
        cb({
          userStats: {
            update: prismaUserUpdate,
          },
          $executeRaw: prismaExecuteRaw,
        }),
      );
    redisDel
      .mockReset()
      .mockImplementation(async (...keys: string[]) => keys.length);
    clearReportsCache.mockReset().mockResolvedValue(undefined);
    clearStrikesCache.mockReset().mockResolvedValue(undefined);
    s3Send.mockReset();
  });

  it("updates user stats inside a transaction and clamps reputation changes through raw sql", async () => {
    await updateUserStats("user_1", {
      answersGiven: { increment: 1 },
      reputationPoints: { decrement: 4 },
    });

    expect(prismaUserUpdate).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        answersGiven: { increment: 1 },
      },
    });
    expect(prismaExecuteRaw).toHaveBeenCalled();
  });

  it("clears moderation caches for a user and clears user cache keys", async () => {
    await clearModerationCachesForUser("user_1");
    await clearUserCache("user_1");

    expect(clearReportsCache).toHaveBeenCalled();
    expect(clearStrikesCache).toHaveBeenCalled();
    expect(redisDel).toHaveBeenCalledWith("auth:user:user_1", "user:user_1");
  });

  it("extracts object keys from complete and protocol-less urls and returns null for invalid input", () => {
    expect(getObjectKeyFromUrl("https://cdn.example.com/a/b.png")).toBe(
      "a/b.png",
    );
    expect(getObjectKeyFromUrl("cdn.example.com/a/b.png")).toBe("a/b.png");
    expect(getObjectKeyFromUrl("::::")).toBeNull();
  });

  it("moves s3 objects when the source exists and tolerates delete failures", async () => {
    s3Send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("delete failed"));

    await expect(moveS3Object("temp/a.png", "profile/a.png")).resolves.toBe(
      true,
    );
    expect(s3Send).toHaveBeenCalledTimes(3);
  });

  it("returns false when the source object is missing or copy fails", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    s3Send.mockRejectedValueOnce(new Error("missing"));
    await expect(moveS3Object("temp/a.png", "profile/a.png")).resolves.toBe(
      false,
    );

    s3Send.mockReset();
    s3Send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("copy failed"));
    await expect(moveS3Object("temp/a.png", "profile/a.png")).resolves.toBe(
      false,
    );

    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
