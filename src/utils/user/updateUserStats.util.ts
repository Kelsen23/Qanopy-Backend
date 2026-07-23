import type { Prisma } from "../../generated/prisma/client.js";

import prisma from "../../config/prisma.config.js";

async function updateUserStats(userId: string, data: any) {
  const { reputationPoints, ...rest } = data;

  let increment = 0;

  if (reputationPoints) {
    if ("increment" in reputationPoints) increment = reputationPoints.increment;
    else if ("decrement" in reputationPoints)
      increment = -reputationPoints.decrement;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (Object.keys(rest).length > 0) {
      await tx.userStats.update({
        where: { userId },
        data: rest,
      });
    }

    if (reputationPoints) {
      await tx.$executeRaw`
            UPDATE "UserStats"
            SET "reputationPoints" =
              GREATEST(0, "reputationPoints" + ${increment})
            WHERE "userId" = ${userId};
          `;
    }
  });
}

export default updateUserStats;
