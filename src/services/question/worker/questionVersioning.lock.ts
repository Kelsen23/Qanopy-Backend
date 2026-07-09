import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { getRedisCacheClient } from "../../../config/redis.config.js";

const QUESTION_VERSION_LOCK_TTL_MS = 30000;
const QUESTION_VERSION_LOCK_WAIT_MS = 10000;
const QUESTION_VERSION_LOCK_RETRY_DELAY_MS = 100;
const QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS = 10000;

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

const withQuestionVersionLock = async <T>(
  questionId: string,
  action: () => Promise<T>,
) => {
  const { lockKey, lockToken } = await acquireQuestionVersionLock(questionId);
  const lockRenewer = setInterval(() => {
    void renewQuestionVersionLock(lockKey, lockToken)
      .then((renewed) => {
        if (!renewed) {
          console.error(
            `Question version lock lost before renewal for question ${questionId}`,
          );
        }
      })
      .catch((error) => {
        console.error(
          `Failed to renew question version lock for question ${questionId}:`,
          error,
        );
      });
  }, QUESTION_VERSION_LOCK_RENEW_INTERVAL_MS);

  try {
    return await action();
  } finally {
    clearInterval(lockRenewer);
    await releaseQuestionVersionLock(lockKey, lockToken);
  }
};

export { withQuestionVersionLock };
