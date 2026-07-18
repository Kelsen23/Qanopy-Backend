import prisma from "../../config/prisma.config.js";

import {
  normalizeProfileText,
  validateUsername,
} from "../user/profileFieldValidation.util.js";

const MAX_OAUTH_USERNAME_ATTEMPTS = 25;

function generateOAuthUsername(base: string, maxLength = 20) {
  const randomSuffix = () =>
    Math.random().toString(36).slice(2, 10).padEnd(8, "0");

  const makeFallbackUsername = () =>
    `user_${randomSuffix()}`.slice(0, maxLength);

  const withRandomPrefix = (value: string) => {
    const prefix = randomSuffix();
    return `${prefix}_${value}`.slice(0, maxLength);
  };

  const resolveBaseUsername = () => {
    const candidate = normalizeProfileText(base).slice(0, maxLength).trim();

    try {
      return validateUsername(candidate);
    } catch {
      return validateUsername(makeFallbackUsername());
    }
  };

  const exists = async (name: string) =>
    !!(await prisma.user.findUnique({ where: { username: name } }));

  const attempt = async (): Promise<string> => {
    let username = resolveBaseUsername();

    if (!(await exists(username))) return username;

    for (let attempts = 0; attempts < MAX_OAUTH_USERNAME_ATTEMPTS; attempts++) {
      const candidate = validateUsername(withRandomPrefix(username));

      if (!(await exists(candidate))) return candidate;
    }

    throw new Error("Unable to generate a unique OAuth username");
  };

  return attempt();
}

export { MAX_OAUTH_USERNAME_ATTEMPTS };

export default generateOAuthUsername;
