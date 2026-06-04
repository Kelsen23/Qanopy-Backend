import HttpError from "../../utils/httpError.util.js";
import sanitizeUser from "../../utils/sanitizeUser.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import prisma from "../../config/prisma.config.js";

interface UpdateProfileInput {
  userId: string;
  displayName?: string | null;
  bio?: string;
}

const updateProfile = async ({
  userId,
  displayName,
  bio,
}: UpdateProfileInput) => {
  const cachedUser = await getRedisCacheClient().get(`user:${userId}`);
  const foundUser = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({ where: { id: userId } });

  if (!foundUser) throw new HttpError("User not found", 404);

  const data: { displayName?: string | null; bio?: string } = {};

  if (displayName !== undefined && displayName !== foundUser.displayName) {
    data.displayName = displayName;
  }

  if (bio !== undefined && bio !== foundUser.bio) data.bio = bio;

  if (Object.keys(data).length === 0) {
    throw new HttpError("Profile already up to date", 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  await getRedisCacheClient().set(
    `user:${updatedUser.id}`,
    JSON.stringify(sanitizeUser(updatedUser)),
    "EX",
    60 * 20,
  );

  return { user: sanitizeUser(updatedUser) };
};

export default updateProfile;
