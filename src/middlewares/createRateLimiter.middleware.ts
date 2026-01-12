import { RateLimiterRedis } from "rate-limiter-flexible";

import { NextFunction, Request, Response } from "express";

const createRateLimiterMiddleware = (
  limiter: RateLimiterRedis,
  message: string,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    limiter
      .consume(req.ip || "unknown")
      .then(() => next())
      .catch(() => {
        res.status(429).json({ message });
      });
  };
};

export default createRateLimiterMiddleware;
