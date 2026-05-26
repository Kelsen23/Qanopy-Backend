import { createRequire } from "module";

import z from "zod";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

const normalizeText = (text: string) => text.replace(/[^a-zA-Z]+/g, " ");

const displayNameSchema = z
  .string()
  .min(3, "Display name must be at least 3 characters")
  .max(20, "Display name must be at most 20 characters")
  .regex(
    /^[a-zA-Z0-9_. ]+$/,
    "Only letters, numbers, spaces, underscores, and dots allowed",
  )
  .refine((displayName) => displayName.trim().length > 0, {
    message: "Display name cannot be only spaces",
  })
  .refine((displayName) => !leoProfanity.check(normalizeText(displayName)), {
    message: "Display name contains inappropriate language",
  });

const bioSchema = z
  .string()
  .max(200, "Bio must be at most 200 characters")
  .refine((bio) => (bio ? !leoProfanity.check(bio) : true), {
    message: "Bio contains inappropriate language",
  });

const profilePictureObjectKeySchema = z.string().nonempty("objectKey is required");

const notificationSettingsSchema = z
  .object({
    upvote: z.boolean(),
    downvote: z.boolean(),
    answerCreated: z.boolean(),
    replyCreated: z.boolean(),
    answerAccepted: z.boolean(),
    answerMarkedBest: z.boolean(),
    aiSuggestionUnlocked: z.boolean(),
    aiAnswerUnlocked: z.boolean(),
    similarQuestionsReady: z.boolean(),
  })
  .strict();

const notificationIdsSchema = z
  .array(z.string("Only strings allowed as notification ids"))
  .max(100, "Max of 100 notification allowed to be passed")
  .nonempty({ message: "There must be at least one notification" });

const updateProfilePictureSchema = z.object({
  objectKey: profilePictureObjectKeySchema,
});

const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.nullable().optional(),
    bio: bioSchema.optional(),
  })
  .strict()
  .refine(
    ({ displayName, bio }) => displayName !== undefined || bio !== undefined,
    {
      message: "At least one of displayName or bio is required",
    },
  );

const updateNotificationSettingsSchema = notificationSettingsSchema;

const markNotificationsAsSeenSchema = z.object({
  notificationIds: notificationIdsSchema,
});

export {
  updateProfilePictureSchema,
  updateProfileSchema,
  updateNotificationSettingsSchema,
  markNotificationsAsSeenSchema,
  displayNameSchema,
  bioSchema,
  profilePictureObjectKeySchema,
  notificationSettingsSchema,
  notificationIdsSchema,
};
