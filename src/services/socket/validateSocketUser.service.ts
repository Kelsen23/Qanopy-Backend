import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

type SocketConnectUser = {
  id: string;
  tokenVersion: number;
  status: string;
  isVerified: boolean;
  isDeleted?: boolean;
};

const validateSocketUser = async (userId: string, tokenVersion: number) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);

  const user: SocketConnectUser | null = cachedUser
    ? (JSON.parse(cachedUser) as SocketConnectUser)
    : await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tokenVersion: true,
          status: true,
          isVerified: true,
          isDeleted: true,
        },
      });

  if (!user) {
    throw new Error("User not found");
  }

  if (Number(user.tokenVersion ?? 0) !== Number(tokenVersion ?? 0)) {
    throw new Error("User token expired");
  }

  if (!user.isVerified || user.status !== "ACTIVE" || user.isDeleted) {
    throw new Error("Unauthorized user");
  }
};

export default validateSocketUser;
