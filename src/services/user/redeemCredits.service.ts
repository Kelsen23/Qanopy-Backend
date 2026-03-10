import prisma from "../../config/prisma.config.js";
import HttpError from "../../utils/httpError.util.js";

const dailyCredit = 10;

const redeemCredits = async (userId: string) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsLastRedeemedAt: true },
  });

  if (!foundUser) throw new HttpError("User not found", 404);

  const now = new Date();
  const lastRedeemed = foundUser.creditsLastRedeemedAt?.getTime() ?? 0;

  if (now.getTime() - lastRedeemed >= 24 * 60 * 60 * 1000) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        credits: { increment: dailyCredit },
        creditsLastRedeemedAt: now,
      },
    });

    return {
      credited: dailyCredit,
      totalCredits: updatedUser.credits,
    };
  }

  return {
    credited: 0,
    totalCredits: foundUser.credits,
  };
};

export default redeemCredits;
