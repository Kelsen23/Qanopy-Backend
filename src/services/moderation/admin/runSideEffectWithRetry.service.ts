import { setTimeout as sleep } from "node:timers/promises";

type AdminSideEffectContext = Record<string, unknown>;

type SideEffectResult<TResult = unknown> = {
  success: boolean;
  attempts: number;
  result?: TResult;
};

const SIDE_EFFECT_RETRY_DELAYS_MS = [0, 200, 600] as const;

const runSideEffectWithRetry = async <TResult = unknown>(
  effectName: string,
  fn: () => Promise<TResult>,
  context: AdminSideEffectContext,
): Promise<SideEffectResult<TResult>> => {
  let lastError: unknown;

  for (let i = 0; i < SIDE_EFFECT_RETRY_DELAYS_MS.length; i++) {
    const delayMs = SIDE_EFFECT_RETRY_DELAYS_MS[i];
    if (delayMs > 0) await sleep(delayMs);

    try {
      const result = await fn();
      return { success: true, attempts: i + 1, result };
    } catch (error) {
      lastError = error;
    }
  }

  console.error("[adminModeration] Non-critical side effect failed", {
    ...context,
    effectName,
    attempts: SIDE_EFFECT_RETRY_DELAYS_MS.length,
    error: lastError,
  });

  return { success: false, attempts: SIDE_EFFECT_RETRY_DELAYS_MS.length };
};

export type { AdminSideEffectContext, SideEffectResult };

export default runSideEffectWithRetry;
