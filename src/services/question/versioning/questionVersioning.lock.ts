import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { getRedisCacheClient } from "../../../config/redis.config.js";

const QUESTION_VERSION_LOCK_TTL_MS = 30000;
const QUESTION_VERSION_LOCK_WAIT_MS = 10000;
const QUESTION_VERSION_LOCK_RETRY_DELAY_MS = 100;
const QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS = 10000;

class QuestionVersionLockLostError extends Error {
  constructor(questionId: string) {
    super(`Question version lock lost for question ${questionId}`);
    this.name = "QuestionVersionLockLostError";
  }
}

const acquireQuestionVersionLock = async (questionId: string) => {
  const redis = getRedisCacheClient();
  const lockKey = `lock:questionVersioning:${questionId}`;
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + QUESTION_VERSION_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redis.set(
      lockKey,
      lockToken,
      "PX",
      QUESTION_VERSION_LOCK_TTL_MS,
      "NX",
    );

    if (acquired === "OK") return { lockKey, lockToken };

    await sleep(QUESTION_VERSION_LOCK_RETRY_DELAY_MS);
  }

  throw new Error(
    `Could not acquire question version lock for question ${questionId}`,
  );
};

const releaseQuestionVersionLock = async (
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

const renewQuestionVersionLock = async (lockKey: string, lockToken: string) => {
  const redis = getRedisCacheClient();

  const renewed = await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
    String(QUESTION_VERSION_LOCK_TTL_MS),
  );

  return Number(renewed) === 1;
};

const isQuestionVersionLockHeld = async (
  lockKey: string,
  lockToken: string,
) => {
  const redis = getRedisCacheClient();

  const isHeld = await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return 1
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
  );

  return Number(isHeld) === 1;
};

const waitForRenewalToSettle = async (
  renewalInFlight: Promise<void> | null,
) => {
  if (!renewalInFlight) return;

  await Promise.allSettled([renewalInFlight]);
};

const withQuestionVersionLock = async <T>(
  questionId: string,
  action: (helpers: { assertLockHeld: () => Promise<void> }) => Promise<T>,
) => {
  const { lockKey, lockToken } = await acquireQuestionVersionLock(questionId);
  let lockError: Error | null = null;
  let renewalInFlight: Promise<void> | null = null;

  const markLockLost = (error?: unknown) => {
    if (lockError) return;

    if (error instanceof Error) {
      lockError = error;
      return;
    }

    lockError = new QuestionVersionLockLostError(questionId);
  };

  const assertLockHeld = async () => {
    await waitForRenewalToSettle(renewalInFlight);

    if (lockError) throw lockError;

    const stillHeld = await isQuestionVersionLockHeld(lockKey, lockToken);

    if (!stillHeld) {
      const error = new QuestionVersionLockLostError(questionId);
      markLockLost(error);
      throw error;
    }
  };

  const lockRenewer = setInterval(() => {
    renewalInFlight = renewQuestionVersionLock(lockKey, lockToken)
      .then((renewed) => {
        if (!renewed) {
          const error = new QuestionVersionLockLostError(questionId);
          console.error(error.message);
          markLockLost(error);
        }
      })
      .catch((error) => {
        console.error(
          `Failed to renew question version lock for question ${questionId}:`,
          error,
        );
        markLockLost(error);
      })
      .finally(() => {
        renewalInFlight = null;
      });
  }, QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS);

  try {
    const result = await action({ assertLockHeld });
    await assertLockHeld();
    return result;
  } finally {
    clearInterval(lockRenewer);
    await waitForRenewalToSettle(renewalInFlight);
    await releaseQuestionVersionLock(lockKey, lockToken);
  }
};

export { QuestionVersionLockLostError, withQuestionVersionLock };
