import jwt from "jsonwebtoken";

import asyncHandler from "./asyncHandler.middleware.js";

import { NextFunction, Request, Response } from "express";

import HttpError from "../utils/httpError.util.js";
import sanitizeUserForAuth from "../utils/sanitizeUserForAuth.util.js";

import prisma from "../config/prisma.config.js";

import { getRedisCacheClient } from "../config/redis.config.js";

import { User } from "../generated/prisma/index.js";

interface AuthenticatedRequest extends Request {
  cookies: {
    token?: any;
  };
  user?: User;
}

const isAuthenticated = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.token;

    if (!token) throw new HttpError("Not authenticated, no token", 400);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        userId: string;
        tokenVersion?: number;
      };
    } catch (error) {
      throw new HttpError("Not authenticated, token failed", 401);
    }

    const cachedUser = await getRedisCacheClient().get(
      `auth:user:${decoded.userId}`,
    );

    const user = cachedUser
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

    if (!user) throw new HttpError("User not found", 404);

    if (Number(user.tokenVersion ?? 0) !== Number(decoded.tokenVersion ?? 0))
      throw new HttpError("User token expired", 401);

    if (user.isDeleted)
      throw new HttpError("User not active", 403);

    if (!cachedUser) {
      await getRedisCacheClient().set(
        `auth:user:${user.id}`,
        JSON.stringify(sanitizeUserForAuth(user)),
        "EX",
        60 * 20,
      );
    }

    req.user = user;
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
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (req.user?.status !== "ACTIVE")
        throw new HttpError("User not active", 403);

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
export { isVerified, requireActiveUser, isAdmin };
