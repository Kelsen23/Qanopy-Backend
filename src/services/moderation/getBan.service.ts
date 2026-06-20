import prisma from "../../config/prisma.config.js";

import clearUserCache from "../../utils/cache/clearUserCache.util.js";

interface GetBanInput {
  userId: string;
}

const getBan = async ({ userId }: GetBanInput) => {
  const now = new Date();

  const ban = await prisma.ban.findFirst({
    where: {
      userId,
      OR: [
        { banType: "TEMP", expiresAt: { gt: now } },
        { banType: "PERM", expiresAt: null },
      ],
    },
    orderBy: { banType: "asc" },
    select: {
      id: true,
      title: true,
      reasons: true,
      banType: true,
      expiresAt: true,
      durationMs: true,
    },
  });

  if (!ban) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    await clearUserCache(userId);
  }

  return {
    ban: ban ?? null,
    message: ban ? "Successfully received ban" : "Active ban not found",
  };
};

export default getBan;
