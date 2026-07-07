import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { getRedisCacheClient } from "../../config/redis.config.js";

type PromotedContentImageOutcome = {
  status: "PROMOTED";
  permUrl: string;
  userId: string;
  updatedAt: string;
};

type DeletedUnsafeContentImageOutcome = {
  status: "DELETED_UNSAFE";
  userId: string;
  updatedAt: string;
};

type ContentImageOutcome =
  | PromotedContentImageOutcome
  | DeletedUnsafeContentImageOutcome;

const CONTENT_IMAGE_LOCK_TTL_MS = 30000;
const CONTENT_IMAGE_LOCK_WAIT_MS = 10000;
const CONTENT_IMAGE_LOCK_RETRY_DELAY_MS = 100;

const getContentImageOutcomeKey = (tempKey: string) =>
  `content:image:outcome:${tempKey}`;

const getContentImageLockKey = (tempKey: string) =>
  `lock:contentImageFinalize:${tempKey}`;

const getContentImageOutcome = async (
  tempKey: string,
): Promise<ContentImageOutcome | null> => {
  const value = await getRedisCacheClient().get(
    getContentImageOutcomeKey(tempKey),
  );
  if (!value) return null;

  try {
    return JSON.parse(value) as ContentImageOutcome;
  } catch (error) {
    console.warn(
      "[contentImageFinalizeOutcome] Failed to parse Redis outcome",
      {
        tempKey,
        error,
      },
    );

    return null;
  }
};

const setContentImageOutcomePromoted = async (
  tempKey: string,
  permUrl: string,
  userId: string,
) => {
  await getRedisCacheClient().set(
    getContentImageOutcomeKey(tempKey),
    JSON.stringify({
      status: "PROMOTED",
      permUrl,
      userId,
      updatedAt: new Date().toISOString(),
    } satisfies PromotedContentImageOutcome),
  );
};

const setContentImageOutcomeDeletedUnsafe = async (
  tempKey: string,
  userId: string,
) => {
  await getRedisCacheClient().set(
    getContentImageOutcomeKey(tempKey),
    JSON.stringify({
      status: "DELETED_UNSAFE",
      userId,
      updatedAt: new Date().toISOString(),
    } satisfies DeletedUnsafeContentImageOutcome),
  );
};

const acquireContentImageFinalizeLock = async (tempKey: string) => {
  const redis = getRedisCacheClient();
  const lockKey = getContentImageLockKey(tempKey);
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + CONTENT_IMAGE_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redis.set(
      lockKey,
      lockToken,
      "PX",
      CONTENT_IMAGE_LOCK_TTL_MS,
      "NX",
    );

    if (acquired === "OK") return { lockKey, lockToken };

    await sleep(CONTENT_IMAGE_LOCK_RETRY_DELAY_MS);
  }

  throw new Error(
    `Could not acquire content image finalize lock for temp key ${tempKey}`,
  );
};

const releaseContentImageFinalizeLock = async (
  lockKey: string,
  lockToken: string,
) => {
  const redis = getRedisCacheClient();

  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
  );
};

export type { ContentImageOutcome };

export {
  acquireContentImageFinalizeLock,
  getContentImageOutcome,
  releaseContentImageFinalizeLock,
  setContentImageOutcomeDeletedUnsafe,
  setContentImageOutcomePromoted,
};
