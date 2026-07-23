import type {
  CreditPeriodType,
  Prisma,
} from "../../../generated/prisma/client.js";

import getCreditLimits from "./getCreditLimits.service.js";

const getNextDailyResetAt = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

const getNextWeeklyResetAt = () =>
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const getNextResetAt = (periodType: CreditPeriodType) =>
  periodType === "DAILY" ? getNextDailyResetAt() : getNextWeeklyResetAt();

const ensureCreditPeriodRows = async (
  tx: Prisma.TransactionClient,
  userId: string,
) => {
  await Promise.all(
    getCreditLimits().map(({ periodType }) =>
      tx.creditPeriodUsage.upsert({
        where: { userId_periodType: { userId, periodType } },
        update: {},
        create: {
          userId,
          periodType,
          resetAt: getNextResetAt(periodType),
        },
      }),
    ),
  );
};

const resetExpiredCreditPeriods = async (
  tx: Prisma.TransactionClient,
  userId: string,
) => {
  const now = new Date();

  await Promise.all(
    getCreditLimits().map(({ periodType }) =>
      tx.creditPeriodUsage.updateMany({
        where: {
          userId,
          periodType,
          resetAt: { lte: now },
        },
        data: {
          used: 0,
          resetAt: getNextResetAt(periodType),
        },
      }),
    ),
  );
};

export { ensureCreditPeriodRows, getNextResetAt, resetExpiredCreditPeriods };
