import prisma from "../../config/prisma.config.js";

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
  });

  if (!ban) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });
  }

  return {
    ban: ban ?? null,
    message: ban ? "Successfully received ban" : "Active ban not found",
  };
};

export default getBan;
