import DataLoader from "dataloader";

import prisma from "../config/prisma.config.js";

const batchUsers = async (userIds: readonly string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
  });

  const userMap: Record<string, any> = {};
  users.forEach((user) => {
    userMap[user.id] = user;
  });

  return userIds.map((id) => userMap[id]);
};

const createUserLoader = () => new DataLoader(batchUsers);

export default createUserLoader;
