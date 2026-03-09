import prisma from "../config/prisma.config.js";

async function updateUserStats(userId: string, data: any) {
  const { reputationPoints, ...rest } = data;

  let increment = 0;

  if (reputationPoints) {
    if ("increment" in reputationPoints) increment = reputationPoints.increment;
    else if ("decrement" in reputationPoints)
      increment = -reputationPoints.decrement;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(rest).length > 0) {
      await tx.user.update({
        where: { id: userId },
        data: rest,
      });
    }

    if (reputationPoints) {
      await tx.$executeRaw`
            UPDATE "User"
            SET "reputationPoints" =
              GREATEST(0, "reputationPoints" + ${increment})
            WHERE id = ${userId};
          `;
    }
  });
}

export default updateUserStats;
