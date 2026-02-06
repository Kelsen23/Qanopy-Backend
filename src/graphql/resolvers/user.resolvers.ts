import { Redis } from "ioredis";

import HttpError from "../../utils/httpError.util.js";
import sanitizeUser from "../../utils/sanitizeUser.util.js";

const userResolvers = {
  Query: {
    getUserById: async (
      _: any,
      { id }: { id: string },
      {
        prisma,
        getRedisCacheClient,
      }: { prisma: any; getRedisCacheClient: () => Redis },
    ) => {
      const cachedUser = await getRedisCacheClient().get(`user:${id}`);

      if (cachedUser) return JSON.parse(cachedUser);

      const foundUser = await prisma.user.findUnique({ where: { id } });
      if (!foundUser) throw new HttpError("User not found", 404);

      await getRedisCacheClient().set(
        `user:${id}`,
        JSON.stringify(sanitizeUser(foundUser)),
        "EX",
        60 * 20,
      );

      return sanitizeUser(foundUser);
    },
  },
};

export default userResolvers;
