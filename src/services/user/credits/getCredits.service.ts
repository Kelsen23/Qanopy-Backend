import type { CreditPeriodType } from "../../../generated/prisma/client.js";

import {
  ensureCreditPeriodRows,
  getNextResetAt,
  resetExpiredCreditPeriods,
} from "./creditPeriodUsage.shared.js";
import getCreditLimits from "./getCreditLimits.service.js";
import reactivateBlockedAiAnswerGenerations from "./reactivateBlockedAiAnswerGenerations.service.js";

import prisma from "../../../config/prisma.config.js";

type CreditPeriodSummary = {
  periodType: CreditPeriodType;
  spentPercentage: number;
  remainingPercentage: number;
  resetAt: Date;
};

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const roundPercentage = (value: number) =>
  Number(clampPercentage(value).toFixed(2));

const getCredits = async ({ userId }: { userId: string }) => {
  const limits = getCreditLimits();

  const { periodUsages, didResetPeriod } = await prisma.$transaction(
    async (tx) => {
      await ensureCreditPeriodRows(tx, userId);
      const didResetPeriod = await resetExpiredCreditPeriods(tx, userId);

      const periodUsages = await tx.creditPeriodUsage.findMany({
        where: {
          userId,
          periodType: { in: limits.map(({ periodType }) => periodType) },
        },
        select: {
          periodType: true,
          used: true,
          resetAt: true,
        },
      });

      return { periodUsages, didResetPeriod };
    },
  );

  if (didResetPeriod) {
    await reactivateBlockedAiAnswerGenerations(userId).catch((error) => {
      console.error(
        "Failed to reactivate blocked AI Answer generations:",
        error,
      );
    });
  }

  const creditPeriods: CreditPeriodSummary[] = limits.map(
    ({ periodType, limit }) => {
      const periodUsage = periodUsages.find(
        (usage) => usage.periodType === periodType,
      );
      const spent = periodUsage?.used ?? 0;
      const spentPercentage = (spent / limit) * 100;
      const remainingPercentage = 100 - spentPercentage;

      return {
        periodType,
        spentPercentage: roundPercentage(spentPercentage),
        remainingPercentage: roundPercentage(remainingPercentage),
        resetAt: periodUsage?.resetAt ?? getNextResetAt(periodType),
      };
    },
  );

  return { creditPeriods };
};

export default getCredits;

export type { CreditPeriodSummary };
