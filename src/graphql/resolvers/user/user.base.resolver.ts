import { Redis } from "ioredis";

import HttpError from "../../../utils/httpError.util.js";
import sanitizeUser from "../../../utils/sanitizeUser.util.js";

type SanitizedUser = ReturnType<typeof sanitizeUser>;

const userBaseResolver = {
  Query: {
    user: async (
      _: any,
      { id }: { id: string },
      {
        prisma,
        getRedisCacheClient,
      }: { prisma: any; getRedisCacheClient: () => Redis },
    ) => {
      const cachedUser = await getRedisCacheClient().get(`user:${id}`);

      if (cachedUser) return JSON.parse(cachedUser) as SanitizedUser;

      const foundUser = await prisma.user.findUnique({ where: { id } });
      if (!foundUser) throw new HttpError("User not found", 404);

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
