import type { CreditPeriodType } from "../../../generated/prisma/client.js";

import {
  ensureCreditPeriodRows,
  resetExpiredCreditPeriods,
} from "./creditPeriodUsage.shared.js";
import getCreditLimits from "./getCreditLimits.service.js";

import prisma from "../../../config/prisma.config.js";

type CreditPeriodSummary = {
  periodType: CreditPeriodType;
  spentPercentage: number;
  remainingPercentage: number;
  resetAt: Date;
};

const getCredits = async ({ userId }: { userId: string }) => {
  const limits = getCreditLimits();

  const periodUsages = await prisma.$transaction(async (tx) => {
    await ensureCreditPeriodRows(tx, userId);
    await resetExpiredCreditPeriods(tx, userId);

    return tx.creditPeriodUsage.findMany({
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
  });

  const creditPeriods: CreditPeriodSummary[] = limits.map(
    ({ periodType, limit }) => {
      const periodUsage = periodUsages.find(
        (usage) => usage.periodType === periodType,
      );
      const spent = periodUsage?.used ?? 0;
      const spentPercentage = (spent / limit) * 100;

      return {
        periodType,
        spentPercentage,
        remainingPercentage: 100 - spentPercentage,
        resetAt: periodUsage?.resetAt ?? new Date(),
      };
    },
  );

  return { creditPeriods };
};

export default getCredits;

export type { CreditPeriodSummary };
