import jwt from "jsonwebtoken";

import asyncHandler from "./asyncHandler.middleware.js";

import { NextFunction, Request, Response } from "express";

import HttpError from "../utils/httpError.util.js";
import sanitizeUserForAuth from "../utils/sanitizeUserForAuth.util.js";

import prisma from "../config/prisma.config.js";

import { getRedisCacheClient } from "../config/redis.config.js";

type AuthenticatedUser = {
  id: string;
  tokenVersion?: number;
  status?: string;
  isVerified?: boolean;
  role?: string;
  isDeleted?: boolean;
};

interface AuthenticatedRequest extends Request {
  cookies: {
    token?: any;
  };
  user?: AuthenticatedUser;
}

const resolveAuthenticatedUser = async (
  req: AuthenticatedRequest,
  strict = true,
) => {
  const token = req.cookies.token;

  if (!token) {
    if (strict) throw new HttpError("Not authenticated, no token", 400);
    return null;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      tokenVersion?: number;
    };
  } catch (error) {
    if (strict) throw new HttpError("Not authenticated, token failed", 401);
    return null;
  }

  const cachedUser = await getRedisCacheClient().get(
    `auth:user:${decoded.userId}`,
  );

  const user: AuthenticatedUser | null = cachedUser
    ? JSON.parse(cachedUser)
    : await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          tokenVersion: true,
          status: true,
          isVerified: true,
          role: true,
          isDeleted: true,
        },
      });

  if (!user) {
    if (strict) throw new HttpError("User not found", 404);
    return null;
  }

  if (Number(user.tokenVersion ?? 0) !== Number(decoded.tokenVersion ?? 0)) {
    if (strict) throw new HttpError("User token expired", 401);
    return null;
  }

  if (user.isDeleted) {
    if (strict) throw new HttpError("User not active", 403);
    return null;
  }

  if (!cachedUser) {
    await getRedisCacheClient().set(
      `auth:user:${user.id}`,
      JSON.stringify(sanitizeUserForAuth(user)),
      "EX",
      60 * 20,
    );
  }

  return user;
};

const isAuthenticated = asyncHandler(
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.user = (await resolveAuthenticatedUser(req, true)) as AuthenticatedUser;
    next();
  },
);

const requireLoggedOut = asyncHandler(
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const user = await resolveAuthenticatedUser(req, false);

    if (user) {
      throw new HttpError(
        "Password reset is only available when logged out, use change password instead",
        400,
      );
    }

    next();
  },
);

const isVerified = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.isVerified) throw new HttpError("User not verified", 403);
    next();
  },
);

const requireActiveUser = asyncHandler(
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.user?.status !== "ACTIVE") throw new HttpError("User not active", 403);

    next();
  },
);

const isAdmin = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== "ADMIN")
      throw new HttpError("User forbidden accessing this route", 403);

    next();
  },
);

export default isAuthenticated;
export { isVerified, requireActiveUser, isAdmin, requireLoggedOut };
