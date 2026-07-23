import { Prisma } from "../../../generated/prisma/client.js";

import prisma from "../../../config/prisma.config.js";

const refundCreditCharge = async ({
  operationKey,
  reason,
}: {
  operationKey: string;
  reason?: string;
}) => {
  try {
    return await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const operation = await tx.creditOperation.findUnique({
          where: { operationKey },
        });

        if (!operation || operation.status !== "CHARGED") {
          return { refunded: false };
        }

        if (operation.dailyResetAt) {
          await tx.$executeRaw`
            UPDATE "CreditPeriodUsage"
            SET "used" = GREATEST(0, "used" - ${operation.chargeAmount})
            WHERE "userId" = ${operation.userId}
              AND "periodType" = 'DAILY'::"CreditPeriodType"
              AND "resetAt" = ${operation.dailyResetAt};
          `;
        }

        if (operation.weeklyResetAt) {
          await tx.$executeRaw`
            UPDATE "CreditPeriodUsage"
            SET "used" = GREATEST(0, "used" - ${operation.chargeAmount})
            WHERE "userId" = ${operation.userId}
              AND "periodType" = 'WEEKLY'::"CreditPeriodType"
              AND "resetAt" = ${operation.weeklyResetAt};
          `;
        }

        await tx.creditOperation.update({
          where: { id: operation.id },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
            reason,
          },
        });

        return { refunded: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    await prisma.creditOperation
      .update({
        where: { operationKey },
        data: {
          status: "REFUND_PENDING",
          reason: reason ?? "Refund failed",
        },
      })
      .catch(() => undefined);

    throw error;
  }
};

export default refundCreditCharge;
