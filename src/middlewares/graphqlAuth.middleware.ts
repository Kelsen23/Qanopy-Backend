import jwt from "jsonwebtoken";

import HttpError from "../utils/httpError.util.js";
import sanitizeUserForAuth from "../utils/sanitizeUserForAuth.util.js";

import prisma from "../config/prisma.config.js";
import { getRedisCacheClient } from "../config/redis.config.js";

import AuthenticatedRequest from "../types/authenticatedRequest.type.js";

const authenticateGraphQLUser = async (req: AuthenticatedRequest) => {
  const token = req.cookies?.token;

  if (!token) throw new HttpError("Not authenticated, no token", 400);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      tokenVersion?: number;
    };
  } catch (err) {
    throw new HttpError("Not authenticated, token failed", 401);
  }

  const userId = decoded.userId;

  const cachedUser = await getRedisCacheClient().get(`auth:user:${userId}`);

  if (cachedUser) {
    const cachedUserObj = JSON.parse(cachedUser);

    if (!cachedUserObj.isVerified)
      throw new HttpError("User not verified", 403);

    if (
      Number(cachedUserObj.tokenVersion ?? 0) !==
      Number(decoded.tokenVersion ?? 0)
    )
      throw new HttpError("User token expired", 401);

    if (cachedUserObj.status !== "ACTIVE" || cachedUserObj.isDeleted)
      throw new HttpError("User not active", 403);

    return cachedUserObj;
  }

  const foundUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tokenVersion: true,
      status: true,
      isVerified: true,
      role: true,
      isDeleted: true,
    },
  });
  if (!foundUser) throw new HttpError("User not found", 404);

  await getRedisCacheClient().set(
    `auth:user:${userId}`,
    JSON.stringify(sanitizeUserForAuth(foundUser)),
    "EX",
    60 * 20,
  );

  if (!foundUser.isVerified) throw new HttpError("User not verified", 403);
  if (Number(foundUser.tokenVersion ?? 0) !== Number(decoded.tokenVersion ?? 0))
    throw new HttpError("User token expired", 401);
  if (foundUser.status !== "ACTIVE" || foundUser.isDeleted)
    throw new HttpError("User not active", 403);

  return sanitizeUserForAuth(foundUser);
};

export default authenticateGraphQLUser;
