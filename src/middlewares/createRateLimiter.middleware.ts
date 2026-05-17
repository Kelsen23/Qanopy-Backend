import { RateLimiterRedis } from "rate-limiter-flexible";

import { NextFunction, Request, Response } from "express";

type RateLimiterKeyResolver = (req: Request) => string;

const createRateLimiterMiddleware = (
  limiter: RateLimiterRedis,
  message: string,
  keyResolver: RateLimiterKeyResolver = (req) => req.ip || "unknown",
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    limiter
      .consume(keyResolver(req))
      .then(() => next())
      .catch(() => {
        res.status(429).json({ message });
      });
  };
};

export default createRateLimiterMiddleware;
