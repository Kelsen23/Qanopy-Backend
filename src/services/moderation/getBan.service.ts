import prisma from "../../config/prisma.config.js";

import clearUserCache from "../../utils/cache/clearUserCache.util.js";

import resolveUserBanState from "./resolveUserBanState.service.js";

interface GetBanInput {
  userId: string;
}

const getBan = async ({ userId }: GetBanInput) => {
  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!foundUser) {
    return {
      ban: null,
      message: "Active ban not found",
    };
  }

  const { activeBan, changed } = await resolveUserBanState(userId);

  if (changed) {
    await clearUserCache(userId);
  }

  return {
    ban: activeBan,
    message: activeBan ? "Successfully received ban" : "Active ban not found",
  };
};

export default getBan;
