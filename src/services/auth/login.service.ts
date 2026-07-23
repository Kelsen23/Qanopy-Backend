import bcrypt from "bcrypt";

import { cacheUser, handleExpiredUnverifiedUser } from "./auth.shared.js";
import { getFlattenedUserByEmail } from "../user/userData.service.js";

import HttpError from "../../utils/http/httpError.util.js";

type LoginInput = {
  email: string;
  password: string;
};

const login = async ({ email, password }: LoginInput) => {
  const foundUser = await getFlattenedUserByEmail(email);

  if (!foundUser) throw new HttpError("Invalid credentials", 400);
  if (!foundUser.password) throw new HttpError("Invalid credentials", 400);

  if (await handleExpiredUnverifiedUser(foundUser)) {
    throw new HttpError(
      "Email verification expired, please sign up again",
      410,
    );
  }

  const isPasswordCorrect = await bcrypt.compare(password, foundUser.password);
  if (!isPasswordCorrect) throw new HttpError("Invalid password", 401);

  await cacheUser(foundUser);

  return { user: foundUser };
};

export default login;
