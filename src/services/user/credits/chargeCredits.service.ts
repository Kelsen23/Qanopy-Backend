import { Prisma } from "../../../generated/prisma/client.js";

import {
  ensureCreditPeriodRows,
  resetExpiredCreditPeriods,
} from "./creditPeriodUsage.shared.js";
import getCreditLimits from "./getCreditLimits.service.js";

import prisma from "../../../config/prisma.config.js";

import HttpError from "../../../utils/http/httpError.util.js";

type CreditPeriodResetRow = {
  periodType: "DAILY" | "WEEKLY";
  resetAt: Date;
};

type CreditPeriodUpdateResult = {
  count: number;
};

const chargeCredits = async ({
  userId,
  operationKey,
  type,
  amount,
}: {
  userId: string;
  operationKey: string;
  type: "AI_SUGGESTION" | "AI_ANSWER";
  amount: number;
}) => {
  if (amount <= 0) throw new HttpError("Invalid credit charge amount", 400);

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const existingOperation = await tx.creditOperation.findUnique({
        where: { operationKey },
      });

      if (existingOperation?.status === "CHARGED") {
        throw new HttpError("Credit operation already in progress", 409);
      }

      if (existingOperation?.status === "REFUND_PENDING") {
        throw new HttpError("Credit refund pending for this operation", 409);
      }

      await ensureCreditPeriodRows(tx, userId);
      await resetExpiredCreditPeriods(tx, userId);

      const periodRows: CreditPeriodResetRow[] =
        await tx.creditPeriodUsage.findMany({
          select: {
            periodType: true,
            resetAt: true,
          },
          where: { userId, periodType: { in: ["DAILY", "WEEKLY"] } },
        });

      const dailyResetAt =
        periodRows.find(
          (row: CreditPeriodResetRow) => row.periodType === "DAILY",
        )?.resetAt ?? null;
      const weeklyResetAt =
        periodRows.find(
          (row: CreditPeriodResetRow) => row.periodType === "WEEKLY",
        )?.resetAt ?? null;

      const operation =
        existingOperation?.status === "REFUNDED"
          ? await tx.creditOperation.update({
              where: { id: existingOperation.id },
              data: {
                status: "CHARGED",
                chargeAmount: amount,
                type,
                chargedAt: new Date(),
                refundedAt: null,
                reason: null,
                dailyResetAt,
                weeklyResetAt,
                attemptCount: { increment: 1 },
              },
            })
          : await tx.creditOperation.create({
              data: {
                userId,
                operationKey,
                type,
                status: "CHARGED",
                chargeAmount: amount,
                dailyResetAt,
                weeklyResetAt,
              },
            });

      const updates = await Promise.all(
        getCreditLimits().map(({ periodType, limit }) =>
          tx.creditPeriodUsage.updateMany({
            where: {
              userId,
              periodType,
              used: { lte: limit - amount },
            },
            data: { used: { increment: amount } },
          }),
        ),
      );

      if (
        updates.some((update: CreditPeriodUpdateResult) => update.count === 0)
      ) {
        throw new HttpError("Not enough credits", 400);
      }

      return {
        operationId: operation.id,
        operationKey: operation.operationKey,
        type: operation.type,
        amount: operation.chargeAmount,
        chargedNow: true,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

export default chargeCredits;
