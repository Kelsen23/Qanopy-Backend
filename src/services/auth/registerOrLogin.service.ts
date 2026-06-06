import {
  cacheUser,
  getRegisteredStage,
  handleExpiredUnverifiedUser,
} from "./auth.shared.js";
import queueBadgeAward from "../user/badge/queueBadgeAward.service.js";

import prisma from "../../config/prisma.config.js";

import HttpError from "../../utils/httpError.util.js";
import generateOAuthUsername from "../../utils/generateOAuthUsername.util.js";
import verifyGoogleToken from "../../utils/verifyGoogleToken.util.js";

type OAuthInput =
  | {
      provider: "google";
      idToken: string;
    }
  | {
      provider: "github";
      accessToken: string;
    };

const registerOrLogin = async (input: OAuthInput) => {
  if (input.provider === "google") {
    const { email, name, picture, email_verified } = await verifyGoogleToken(
      input.idToken,
    );

    if (!email_verified)
      throw new HttpError("Email not verified, couldn't register", 400);

    let foundUser = await prisma.user.findFirst({
      where: { email, isDeleted: false },
    });

    if (foundUser && (await handleExpiredUnverifiedUser(foundUser))) {
      foundUser = null;
    }

    if (!foundUser) {
      const uniqueUsername = await generateOAuthUsername(name);
      const registeredStage = await getRegisteredStage();

      const newUser = await prisma.user.create({
        data: {
          username: uniqueUsername,
          email,
          profilePictureUrl: picture,
          isVerified: true,
          authProvider: "GOOGLE",
          registeredStage,
          moderationStats: { create: {} },
          notificationSettings: { create: {} },
        },
      });

      await cacheUser(newUser);

      await queueBadgeAward({ userId: newUser.id });

      return { user: newUser, action: "registered" as const };
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

  let foundUser = await prisma.user.findFirst({
    where: { email, isDeleted: false },
  });

  if (foundUser && (await handleExpiredUnverifiedUser(foundUser))) {
    foundUser = null;
  }

  if (!foundUser) {
    const uniqueUsername = await generateOAuthUsername(name);
    const registeredStage = await getRegisteredStage();

    const newUser = await prisma.user.create({
      data: {
        username: uniqueUsername,
        email,
        profilePictureUrl: avatar_url,
        isVerified: true,
        authProvider: "GITHUB",
        registeredStage,
        moderationStats: { create: {} },
        notificationSettings: { create: {} },
      },
    });

    await cacheUser(newUser);

    await queueBadgeAward({ userId: newUser.id });

    return { user: newUser, action: "registered" as const };
  }

  if (foundUser.authProvider !== "GITHUB")
    throw new HttpError("User is already registered with other method", 400);

  await cacheUser(foundUser);

  return { user: foundUser, action: "loggedIn" as const };
};

export default registerOrLogin;
