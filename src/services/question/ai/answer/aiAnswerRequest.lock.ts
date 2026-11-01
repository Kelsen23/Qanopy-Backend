import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { redisMessagingClientConnection } from "../../../../config/redis.config.js";

const REQUEST_LOCK_TTL_MS = 60000;
const REQUEST_LOCK_WAIT_MS = 120000;
const REQUEST_LOCK_RENEW_INTERVAL_MS = 20000;

const withAiAnswerRequestLock = async <T>(
  questionId: string,
  action: (assertLockHeld: () => Promise<void>) => Promise<T>,
): Promise<T> => {
  const lockKey = `lock:aiAnswerRequest:${questionId}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + REQUEST_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redisMessagingClientConnection.set(
      lockKey,
      token,
      "PX",
      REQUEST_LOCK_TTL_MS,
      "NX",
    );
    if (acquired === "OK") break;
    await sleep(250);
  }

  if ((await redisMessagingClientConnection.get(lockKey)) !== token)
    throw new Error(`Timed out acquiring AI Answer request lock: ${lockKey}`);

  let lockError: Error | null = null;
  let renewalInFlight: Promise<void> | null = null;
  const assertLockHeld = async () => {
    if (renewalInFlight) await renewalInFlight;
    if (lockError) throw lockError;

    if ((await redisMessagingClientConnection.get(lockKey)) !== token) {
      lockError = new Error(`AI Answer request lock lost: ${lockKey}`);
      throw lockError;
    }
  };

  const renewer = setInterval(() => {
    if (renewalInFlight) return;

    renewalInFlight = redisMessagingClientConnection
      .eval(
        `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("PEXPIRE", KEYS[1], ARGV[2])
          end
          return 0
        `,
        1,
        lockKey,
        token,
        String(REQUEST_LOCK_TTL_MS),
      )
      .then((renewed) => {
        if (Number(renewed) !== 1)
          lockError = new Error(`AI Answer request lock lost: ${lockKey}`);
      })
      .catch((error: unknown) => {
        lockError =
          error instanceof Error
            ? error
            : new Error(`AI Answer request lock renewal failed: ${lockKey}`);
      })
      .finally(() => {
        renewalInFlight = null;
      });
  }, REQUEST_LOCK_RENEW_INTERVAL_MS);

  try {
    const result = await action(assertLockHeld);
    await assertLockHeld();
    return result;
  } finally {
    clearInterval(renewer);
    if (renewalInFlight) await Promise.allSettled([renewalInFlight]);
    await redisMessagingClientConnection.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      lockKey,
      token,
    );
  }
};

export default withAiAnswerRequestLock;
