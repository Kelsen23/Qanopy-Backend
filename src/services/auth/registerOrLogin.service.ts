import { Prisma } from "../../generated/prisma/client.js";

import {
  cacheUser,
  getRegisteredStage,
  handleExpiredUnverifiedUser,
  queueBadgeAwardSafely,
} from "./auth.shared.js";
import {
  createUserDefaults,
  flattenUser,
  getFlattenedUserByEmail,
  normalizedUserInclude,
} from "../user/userData.service.js";

import prisma from "../../config/prisma.config.js";

import HttpError from "../../utils/http/httpError.util.js";
import generateOAuthUsername from "../../utils/auth/generateOAuthUsername.util.js";
import verifyGoogleToken from "../../utils/auth/verifyGoogleToken.util.js";

type OAuthInput =
  | {
      provider: "google";
      idToken: string;
    }
  | {
      provider: "github";
      accessToken: string;
    };

type OAuthRegistrationInput = {
  email: string;
  name: string;
  profilePictureUrl?: string | null;
  authProvider: "GOOGLE" | "GITHUB";
};

const MAX_OAUTH_CREATE_ATTEMPTS = 3;

const isUsernameUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  Array.isArray(error.meta?.target) &&
  error.meta.target.includes("username");

const createOAuthUserWithUniqueUsername = async ({
  email,
  name,
  profilePictureUrl,
  authProvider,
}: OAuthRegistrationInput) => {
  const registeredStage = await getRegisteredStage();

  for (let attempt = 0; attempt < MAX_OAUTH_CREATE_ATTEMPTS; attempt++) {
    const uniqueUsername = await generateOAuthUsername(name);

    try {
      return await prisma.user.create({
        data: {
          username: uniqueUsername,
          email,
          ...createUserDefaults({
            registeredStage,
            authProvider,
            isVerified: true,
            profilePictureUrl,
          }),
        },
        include: normalizedUserInclude,
      });
    } catch (error) {
      if (!isUsernameUniqueConstraintError(error)) throw error;
    }
  }

  throw new HttpError("Unable to reserve OAuth username", 409);
};

const registerOrLogin = async (input: OAuthInput) => {
  if (input.provider === "google") {
    const { email, name, picture, email_verified } = await verifyGoogleToken(
      input.idToken,
    );

    if (!email_verified)
      throw new HttpError("Email not verified, couldn't register", 400);

    let foundUser = await getFlattenedUserByEmail(email);

    if (foundUser && (await handleExpiredUnverifiedUser(foundUser))) {
      foundUser = null;
    }

    if (!foundUser) {
      const newUser = await createOAuthUserWithUniqueUsername({
        email,
        name,
        profilePictureUrl: picture,
        authProvider: "GOOGLE",
      });

      const flattenedUser = flattenUser(newUser);

      await cacheUser(flattenedUser);

      await queueBadgeAwardSafely(flattenedUser.id);

      return { user: flattenedUser, action: "registered" as const };
    }

    if (foundUser.authProvider !== "GOOGLE")
      throw new HttpError("User is already registered with other method", 400);

    await cacheUser(foundUser);

    return { user: foundUser, action: "loggedIn" as const };
  }

  const githubRes = await globalThis.fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  const { email, name, avatar_url } = await githubRes.json();

  if (!email || !name) throw new HttpError("Invalid Github access token", 400);

  let foundUser = await getFlattenedUserByEmail(email);

  if (foundUser && (await handleExpiredUnverifiedUser(foundUser))) {
    foundUser = null;
  }

  if (!foundUser) {
    const newUser = await createOAuthUserWithUniqueUsername({
      email,
      name,
      profilePictureUrl: avatar_url,
      authProvider: "GITHUB",
    });

    const flattenedUser = flattenUser(newUser);

    await cacheUser(flattenedUser);

    await queueBadgeAwardSafely(flattenedUser.id);

    return { user: flattenedUser, action: "registered" as const };
  }

  if (foundUser.authProvider !== "GITHUB")
    throw new HttpError("User is already registered with other method", 400);

  await cacheUser(foundUser);

  return { user: foundUser, action: "loggedIn" as const };
};

export default registerOrLogin;
