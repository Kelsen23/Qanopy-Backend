import jwt from "jsonwebtoken";

const decodeSocketToken = (token: string) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
    userId?: string;
    tokenVersion?: number;
  };

  if (!decoded.userId) {
    throw new Error("Authentication failed");
  }

  return {
    userId: decoded.userId,
    tokenVersion: decoded.tokenVersion ?? 0,
  };
};

export default decodeSocketToken;
