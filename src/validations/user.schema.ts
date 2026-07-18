import z from "zod";

import {
  profileBioSchema,
  profileDisplayNameSchema,
} from "../utils/user/profileFieldValidation.util.js";

import { activeEmailSchema, otpSchema } from "./auth.schema.js";

const displayNameSchema = profileDisplayNameSchema;
const bioSchema = profileBioSchema;

const profilePictureObjectKeySchema = z
  .string()
  .nonempty("objectKey is required");

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

const sendEmailChangeSchema = z.object({
  newEmail: activeEmailSchema,
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

const verifyEmailChangeSchema = z.object({
  otp: otpSchema,
});

export {
  updateProfilePictureSchema,
  sendEmailChangeSchema,
  updateProfileSchema,
  updateNotificationSettingsSchema,
  markNotificationsAsSeenSchema,
  verifyEmailChangeSchema,
  displayNameSchema,
  bioSchema,
  profilePictureObjectKeySchema,
  notificationSettingsSchema,
  notificationIdsSchema,
};
