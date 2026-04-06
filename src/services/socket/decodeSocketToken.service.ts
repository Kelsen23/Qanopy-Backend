import jwt from "jsonwebtoken";

const decodeSocketToken = (token: string) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
    userId?: string;
  };

  if (!decoded.userId) {
    throw new Error("Authentication failed");
  }

  return decoded.userId;
};

export default decodeSocketToken;
