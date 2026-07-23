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
  const cachedUser = await getRedisCacheClient().get(`auth:user:${userId}`);

  const user: SocketConnectUser | null = cachedUser
    ? (JSON.parse(cachedUser) as SocketConnectUser)
    : await prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            id: true,
            auth: {
              select: {
                tokenVersion: true,
                isVerified: true,
              },
            },
            statusState: {
              select: {
                status: true,
                isDeleted: true,
              },
            },
          },
        })
        .then((user) =>
          user
            ? {
                id: user.id,
                tokenVersion: user.auth?.tokenVersion ?? 0,
                isVerified: user.auth?.isVerified ?? false,
                status: user.statusState?.status ?? "ACTIVE",
                isDeleted: user.statusState?.isDeleted ?? false,
              }
            : null,
        );

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
