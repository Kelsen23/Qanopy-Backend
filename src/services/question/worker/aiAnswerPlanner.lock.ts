import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { redisMessagingClientConnection } from "../../../config/redis.config.js";

const AI_ANSWER_PLANNER_LOCK_TTL_MS = 60000;
const AI_ANSWER_PLANNER_LOCK_WAIT_MS = 120000;
const AI_ANSWER_PLANNER_LOCK_RETRY_DELAY_MS = 250;
const AI_ANSWER_PLANNER_LOCK_RENEW_INTERVAL_MS = 20000;

class AiAnswerPlannerLockLostError extends Error {
  constructor(lockKey: string) {
    super(`AI Answer Planner lock lost: ${lockKey}`);
    this.name = "AiAnswerPlannerLockLostError";
  }
}

const makeAiAnswerPlannerLockKey = ({
  questionId,
  questionVersion,
  aiAnswerVersion,
}: {
  questionId: string;
  questionVersion: number;
  aiAnswerVersion: number;
}) =>
  `lock:aiAnswerPlanner:${questionId}:${questionVersion}:${aiAnswerVersion}`;

const acquireLock = async (lockKey: string) => {
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + AI_ANSWER_PLANNER_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redisMessagingClientConnection.set(
      lockKey,
      lockToken,
      "PX",
      AI_ANSWER_PLANNER_LOCK_TTL_MS,
      "NX",
    );

    if (acquired === "OK") return lockToken;

    await sleep(AI_ANSWER_PLANNER_LOCK_RETRY_DELAY_MS);
  }

  throw new Error(`Timed out acquiring AI Answer Planner lock: ${lockKey}`);
};

const renewLock = async (lockKey: string, lockToken: string) => {
  const renewed = await redisMessagingClientConnection.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
    `,
    1,
    lockKey,
    lockToken,
    String(AI_ANSWER_PLANNER_LOCK_TTL_MS),
  );

  return Number(renewed) === 1;
};

const releaseLock = async (lockKey: string, lockToken: string) => {
  await redisMessagingClientConnection.eval(
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

const withAiAnswerPlannerLock = async <T>(
  identity: {
    questionId: string;
    questionVersion: number;
    aiAnswerVersion: number;
  },
  action: (assertLockHeld: () => Promise<void>) => Promise<T>,
) => {
  const lockKey = makeAiAnswerPlannerLockKey(identity);
  const lockToken = await acquireLock(lockKey);
  let lockError: Error | null = null;
  let renewalInFlight: Promise<void> | null = null;

  const assertLockHeld = async () => {
    if (renewalInFlight) await renewalInFlight;
    if (lockError) throw lockError;

    const currentToken = await redisMessagingClientConnection.get(lockKey);
    if (currentToken !== lockToken) {
      lockError = new AiAnswerPlannerLockLostError(lockKey);
      throw lockError;
    }
  };

  const renewer = setInterval(() => {
    if (renewalInFlight) return;

    renewalInFlight = renewLock(lockKey, lockToken)
      .then((renewed) => {
        if (!renewed) lockError = new AiAnswerPlannerLockLostError(lockKey);
      })
      .catch((error) => {
        lockError =
          error instanceof Error
            ? error
            : new AiAnswerPlannerLockLostError(lockKey);
      })
      .finally(() => {
        renewalInFlight = null;
      });
  }, AI_ANSWER_PLANNER_LOCK_RENEW_INTERVAL_MS);

  try {
    const result = await action(assertLockHeld);
    await assertLockHeld();
    return result;
  } finally {
    clearInterval(renewer);
    if (renewalInFlight) await Promise.allSettled([renewalInFlight]);
    await releaseLock(lockKey, lockToken);
  }
};

export default withAiAnswerPlannerLock;
