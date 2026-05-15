import DataLoader from "dataloader";

import prisma from "../config/prisma.config.js";
import sanitizeUser from "../utils/sanitizeUser.util.js";

const batchUsers = async (userIds: readonly string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
  });

  const userMap: Record<string, unknown> = {};

  users.forEach((user) => {
    userMap[user.id] = sanitizeUser(user);
  });

  return userIds.map((id) => userMap[id]);
};

const createUserLoader = () => new DataLoader(batchUsers);

export default createUserLoader;
