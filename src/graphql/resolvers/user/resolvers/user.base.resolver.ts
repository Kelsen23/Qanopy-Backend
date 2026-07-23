import { Redis } from "ioredis";

import { getFlattenedUserById } from "../../../../services/user/userData.service.js";

import sanitizeUser from "../../../../utils/auth/sanitizeUser.util.js";

type SanitizedUser = ReturnType<typeof sanitizeUser>;

type GraphqlUserSource = SanitizedUser & {
  displayName?: string | null;
  profilePictureKey?: string | null;
  profilePictureUrl?: string | null;
  bio?: string | null;
  reputationPoints?: number;
  questionsAsked?: number;
  answersGiven?: number;
  bestAnswers?: number;
  status?: string;
  isVerified?: boolean;
};

const toGraphqlUser = (user: GraphqlUserSource) => ({
  ...user,
  displayName: user.profile?.displayName ?? user.displayName ?? null,
  profilePictureKey:
    user.profile?.profilePictureKey ?? user.profilePictureKey ?? null,
  profilePictureUrl:
    user.profile?.profilePictureUrl ?? user.profilePictureUrl ?? null,
  bio: user.profile?.bio ?? user.bio ?? null,
  reputationPoints: user.stats?.reputationPoints ?? user.reputationPoints ?? 0,
  questionsAsked: user.stats?.questionsAsked ?? user.questionsAsked ?? 0,
  answersGiven: user.stats?.answersGiven ?? user.answersGiven ?? 0,
  bestAnswers: user.stats?.bestAnswers ?? user.bestAnswers ?? 0,
  status: user.statusState?.status ?? user.status ?? "ACTIVE",
  isVerified: user.auth?.isVerified ?? user.isVerified ?? false,
});

const userBaseResolver = {
  Query: {
    user: async (
      _: unknown,
      { id }: { id: string },
      { getRedisCacheClient }: { getRedisCacheClient: () => Redis },
    ) => {
      const cachedUser = await getRedisCacheClient().get(`user:${id}`);

      if (cachedUser)
        return toGraphqlUser(JSON.parse(cachedUser) as SanitizedUser);

      const foundUser = await getFlattenedUserById(id);
      if (!foundUser) throw new Error("User not found");

      const sanitizedUser = sanitizeUser(foundUser);

      await getRedisCacheClient().set(
        `user:${id}`,
        JSON.stringify(sanitizedUser),
        "EX",
        60 * 20,
      );

      return toGraphqlUser(sanitizedUser);
    },
  },
};

export default userBaseResolver;
