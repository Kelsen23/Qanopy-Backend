import HttpError from "../../utils/http/httpError.util.js";

import prisma from "../../config/prisma.config.js";
import { getRedisCacheClient } from "../../config/redis.config.js";

import { cacheUser } from "./auth.shared.js";

type IsAuthInput = {
  userId: string;
};

const isAuth = async ({ userId }: IsAuthInput) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  await cacheUser(foundUser);

  return { user: foundUser };
};

export default isAuth;
