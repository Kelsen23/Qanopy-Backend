import { Redis } from "ioredis";

import { getFlattenedUserById } from "../../../../services/user/userData.service.js";

import sanitizeUser from "../../../../utils/auth/sanitizeUser.util.js";

type SanitizedUser = ReturnType<typeof sanitizeUser>;

const userBaseResolver = {
  Query: {
    user: async (
      _: unknown,
      { id }: { id: string },
      { getRedisCacheClient }: { getRedisCacheClient: () => Redis },
    ) => {
      const cachedUser = await getRedisCacheClient().get(`user:${id}`);

      if (cachedUser) return JSON.parse(cachedUser) as SanitizedUser;

      const foundUser = await getFlattenedUserById(id);
      if (!foundUser) throw new Error("User not found");

      const sanitizedUser = sanitizeUser(foundUser);

      await getRedisCacheClient().set(
        `user:${id}`,
        JSON.stringify(sanitizedUser),
        "EX",
        60 * 20,
      );

      return sanitizedUser;
    },
  },
};

export default userBaseResolver;
