import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

type SocketConnectUser = {
  id: string;
  status: string;
  isVerified: boolean;
};

const validateSocketUser = async (userId: string) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);

  const user: SocketConnectUser | null = cachedUser
    ? (JSON.parse(cachedUser) as SocketConnectUser)
    : await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, isVerified: true },
      });

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.isVerified || user.status !== "ACTIVE") {
    throw new Error("Unauthorized user");
  }
};

export default validateSocketUser;
