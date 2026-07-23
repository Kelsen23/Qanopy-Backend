import type { Prisma } from "../../generated/prisma/client.js";

import getActiveBanState from "./getActiveBanState.service.js";

import prisma from "../../config/prisma.config.js";

const resolveUserBanState = async (userId: string) => {
  const now = new Date();

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const userStatus = await tx.userStatus.findUnique({
      where: { userId },
      select: { status: true },
    });

    const activeBanState = await getActiveBanState(tx, userId, now);

    const expiredTempBanIds = activeBanState.activeBans
      .filter(
        (ban) =>
          ban.banType === "TEMP" && ban.expiresAt && ban.expiresAt <= now,
      )
      .map((ban) => ban.id);

    let changed = false;

    if (expiredTempBanIds.length > 0) {
      await tx.ban.updateMany({
        where: {
          id: { in: expiredTempBanIds },
        },
        data: { isActive: false },
      });

      changed = true;
    }

    const resolvedBanState = await getActiveBanState(tx, userId, now);

    const { activeBan, derivedStatus: status } = resolvedBanState;

    if (!activeBan) {
      const cleanupResult = await tx.ban.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: { isActive: false },
      });

      if (cleanupResult.count > 0) {
        changed = true;
      }
    }

    if (userStatus?.status !== status) {
      await tx.userStatus.update({
        where: { userId },
        data: { status },
      });

      changed = true;
    }

    return {
      activeBan,
      status,
      changed,
    };
  });
};

export default resolveUserBanState;
