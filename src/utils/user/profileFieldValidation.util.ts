import { createRequire } from "module";

import z from "zod";

import HttpError from "../http/httpError.util.js";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

const PROFILE_NAME_MIN_LENGTH = 3;
const PROFILE_NAME_MAX_LENGTH = 20;
const BIO_MAX_LENGTH = 150;

const WHITESPACE_REGEX = /\s+/g;
const PROFILE_NAME_ALLOWED_REGEX = /^[a-zA-Z0-9_. ]+$/;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const LINK_REGEX =
  /\b(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|io|gg|co|me|dev|app|xyz|info|ru|cn|tk)\b)/i;
const PUNCTUATION_REGEX = /[\p{P}\p{S}]+/gu;

const RESERVED_PROFILE_NAMES = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "owner",
  "staff",
  "support",
  "help",
  "official",
  "system",
  "qanopy",
  "qanopyadmin",
  "qanopysupport",
  "deleteduser",
]);

const IMPERSONATION_REGEX =
  /\b(?:admin|administrator|moderator|staff|support|official|qanopy\s*team|qanopy\s*staff)\b/i;
const BIO_IMPERSONATION_REGEX =
  /\b(?:i\s*am|i'm|official|verified|qanopy)\b.{0,30}\b(?:admin|administrator|moderator|staff|support|team)\b/i;

const HOMOGLYPH_MAP: Record<string, string> = {
  "@": "a",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  $: "s",
  "!": "i",
  "|": "i",
  а: "a",
  А: "a",
  е: "e",
  Е: "e",
  о: "o",
  О: "o",
  р: "p",
  Р: "p",
  с: "c",
  С: "c",
  х: "x",
  Х: "x",
  у: "y",
  У: "y",
  і: "i",
  І: "i",
  Ѕ: "s",
  ѕ: "s",
};

const BLOCKED_PROFANITY_FRAGMENTS = [
  "shit",
  "fuck",
  "bitch",
  "asshole",
  "cunt",
];

type ProfileNameField = "username" | "displayName";

const fieldLabel = (field: ProfileNameField | "bio") =>
  field === "displayName"
    ? "Display name"
    : field === "username"
      ? "Username"
      : "Bio";

const isHiddenOrControlCharacter = (char: string) => {
  const codePoint = char.codePointAt(0) ?? 0;

  return (
    (codePoint <= 0x1f &&
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x061c ||
    codePoint === 0x180e ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    codePoint === 0xfeff
  );
};

const stripHiddenAndControlCharacters = (value: string) =>
  Array.from(value)
    .filter((char) => !isHiddenOrControlCharacter(char))
    .join("");

const normalizeProfileText = (value: string) =>
  stripHiddenAndControlCharacters(value.normalize("NFKC"))
    .replace(WHITESPACE_REGEX, " ")
    .trim();

const applyHomoglyphMap = (value: string) =>
  Array.from(value)
    .map((char) => HOMOGLYPH_MAP[char] ?? char)
    .join("");

const makeDetectionForms = (value: string) => {
  const lower = value.toLowerCase();
  const homoglyphNormalized = applyHomoglyphMap(lower);
  const punctuationStripped = lower.replace(PUNCTUATION_REGEX, "");
  const compact = lower.replace(/\s+/g, "");
  const compactNoPunctuation = lower
    .replace(PUNCTUATION_REGEX, "")
    .replace(/\s+/g, "");
  const homoglyphCompact = homoglyphNormalized
    .replace(PUNCTUATION_REGEX, "")
    .replace(/\s+/g, "");

  return Array.from(
    new Set([
      lower,
      compact,
      punctuationStripped,
      compactNoPunctuation,
      homoglyphNormalized,
      homoglyphCompact,
    ]),
  ).filter((form) => form.length > 0);
};

const containsProfanity = (forms: string[]) =>
  forms.some(
    (form) =>
      leoProfanity.check(form) ||
      BLOCKED_PROFANITY_FRAGMENTS.some((fragment) => form.includes(fragment)),
  );

const getProfileThreatMessage = (
  cleaned: string,
  field: ProfileNameField | "bio",
) => {
  const detectionForms = makeDetectionForms(cleaned);
  const joinedForms = detectionForms.join(" ");

  if (containsProfanity(detectionForms)) {
    return `${fieldLabel(field)} contains inappropriate language`;
  }

  if (EMAIL_REGEX.test(cleaned) || LINK_REGEX.test(cleaned)) {
    return `${fieldLabel(field)} cannot contain links or email addresses`;
  }

  if (field !== "bio") {
    const compact = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "");

    if (
      RESERVED_PROFILE_NAMES.has(compact) ||
      IMPERSONATION_REGEX.test(joinedForms)
    ) {
      return `${fieldLabel(field)} is reserved`;
    }
  } else if (BIO_IMPERSONATION_REGEX.test(cleaned)) {
    return "Bio cannot impersonate Qanopy staff";
  }

  return null;
};

const getLinkOrEmailMessage = (
  cleaned: string,
  field: ProfileNameField | "bio",
) => {
  if (EMAIL_REGEX.test(cleaned) || LINK_REGEX.test(cleaned)) {
    return `${fieldLabel(field)} cannot contain links or email addresses`;
  }

  return null;
};

const addIssue = (ctx: z.RefinementCtx, message: string) => {
  ctx.addIssue({ code: "custom", message });
};

const profileNameSchema = (field: ProfileNameField) => {
  const label = fieldLabel(field);

  return z
    .string(`${label} must be a string`)
    .transform(normalizeProfileText)
    .superRefine((cleaned, ctx) => {
      if (cleaned.length < PROFILE_NAME_MIN_LENGTH) {
        addIssue(
          ctx,
          `${label} must be at least ${PROFILE_NAME_MIN_LENGTH} characters`,
        );
        return;
      }

      if (cleaned.length > PROFILE_NAME_MAX_LENGTH) {
        addIssue(
          ctx,
          `${label} must be at most ${PROFILE_NAME_MAX_LENGTH} characters`,
        );
        return;
      }

      const linkOrEmailMessage = getLinkOrEmailMessage(cleaned, field);
      if (linkOrEmailMessage) {
        addIssue(ctx, linkOrEmailMessage);
        return;
      }

      if (!PROFILE_NAME_ALLOWED_REGEX.test(cleaned)) {
        addIssue(
          ctx,
          `${label} can only contain letters, numbers, spaces, underscores, and dots`,
        );
        return;
      }

      const threatMessage = getProfileThreatMessage(cleaned, field);
      if (threatMessage) addIssue(ctx, threatMessage);
    });
};

const usernameSchema = profileNameSchema("username");
const displayNameSchema = profileNameSchema("displayName");

const bioSchema = z
  .string("Bio must be a string")
  .transform(normalizeProfileText)
  .superRefine((cleaned, ctx) => {
    if (cleaned.length > BIO_MAX_LENGTH) {
      addIssue(ctx, `Bio must be at most ${BIO_MAX_LENGTH} characters`);
      return;
    }

    if (cleaned.length === 0) return;

    const threatMessage = getProfileThreatMessage(cleaned, "bio");
    if (threatMessage) addIssue(ctx, threatMessage);
  });

const parseProfileField = <T>(schema: z.ZodType<T>, value: unknown) => {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(
      parsed.error.issues[0]?.message ?? "Invalid profile field",
      400,
    );
  }

  return parsed.data;
};

const validateProfileName = (value: unknown, field: ProfileNameField) => {
  return parseProfileField(profileNameSchema(field), value);
};

const validateUsername = (value: unknown) =>
  validateProfileName(value, "username");

const validateDisplayName = (value: unknown) => {
  if (value === null) return null;

  return validateProfileName(value, "displayName");
};

const validateBio = (value: unknown) => {
  if (value === undefined) return undefined;

  return parseProfileField(bioSchema, value);
};

export {
  BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_NAME_MIN_LENGTH,
  makeDetectionForms,
  normalizeProfileText,
  bioSchema as profileBioSchema,
  displayNameSchema as profileDisplayNameSchema,
  usernameSchema as profileUsernameSchema,
  validateBio,
  validateDisplayName,
  validateUsername,
};
