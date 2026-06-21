import prisma from "../../config/prisma.config.js";
import getActiveBanState from "./getActiveBanState.service.js";

const resolveUserBanState = async (userId: string) => {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
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

    if (user?.status !== status) {
      await tx.user.update({
        where: { id: userId },
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
