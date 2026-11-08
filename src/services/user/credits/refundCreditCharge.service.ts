import { Prisma } from "../../../generated/prisma/client.js";

import prisma from "../../../config/prisma.config.js";
import reactivateBlockedAiAnswerGenerations from "./reactivateBlockedAiAnswerGenerations.service.js";

const refundCreditCharge = async ({
  operationKey,
  expectedReason,
  reason,
}: {
  operationKey: string;
  expectedReason?: string | null;
  reason?: string;
}) => {
  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const operation = await tx.creditOperation.findUnique({
          where: { operationKey },
        });

        if (!operation || operation.status !== "CHARGED") {
          return { refunded: false };
        }

        if (
          expectedReason !== undefined &&
          operation.reason !== expectedReason
        ) {
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

        return { refunded: true, userId: operation.userId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if ("userId" in result && typeof result.userId === "string") {
      await reactivateBlockedAiAnswerGenerations(result.userId).catch(
        (error) => {
          console.error(
            "Failed to reactivate blocked AI Answer generations:",
            error,
          );
        },
      );
    }

    return { refunded: result.refunded };
  } catch (error) {
    if (expectedReason === undefined) {
      await prisma.creditOperation
        .update({
          where: { operationKey },
          data: {
            status: "REFUND_PENDING",
            reason: reason ?? "Refund failed",
          },
        })
        .catch(() => undefined);
    } else {
      await prisma.creditOperation
        .updateMany({
          where: {
            operationKey,
            reason: expectedReason,
          },
          data: {
            status: "REFUND_PENDING",
            reason: reason ?? "Refund failed",
          },
        })
        .catch(() => undefined);
    }

    throw error;
  }
};

export default refundCreditCharge;
