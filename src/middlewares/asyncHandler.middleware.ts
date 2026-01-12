import { NextFunction, Request, Response } from "express";

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      const status = error.statusCode || 500;
      res
        .status(status)
        .json({ message: error.message || "Internal Server Error" });
    });
  };

export default asyncHandler;
