import { cacheUser } from "./auth.shared.js";
import { getFlattenedUserById } from "../user/userData.service.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

import HttpError from "../../utils/http/httpError.util.js";

type IsAuthInput = {
  userId: string;
};

const isAuth = async ({ userId }: IsAuthInput) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await getFlattenedUserById(userId);

  if (!foundUser) throw new HttpError("Invalid credentials", 404);

  await cacheUser(foundUser);

  return { user: foundUser };
};

export default isAuth;
