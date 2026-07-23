import DataLoader from "dataloader";

import { getFlattenedUsersByIds } from "../services/user/userData.service.js";

import sanitizeUser from "../utils/auth/sanitizeUser.util.js";

import { toGraphqlUser } from "../graphql/resolvers/user/helpers/user.graphql.helper.js";

const batchUsers = async (userIds: readonly string[]) => {
  const users = await getFlattenedUsersByIds([...userIds]);

  const userMap: Record<string, unknown> = {};

  users.forEach((user) => {
    userMap[user.id] = toGraphqlUser(sanitizeUser(user));
  });

  return userIds.map((id) => userMap[id]);
};

const createUserLoader = () => new DataLoader(batchUsers);

export default createUserLoader;
