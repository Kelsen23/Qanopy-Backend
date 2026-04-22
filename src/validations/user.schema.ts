import { createRequire } from "module";

import z from "zod";

import { Interest } from "../generated/prisma/index.js";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

const normalize = (text: string) => text.replace(/[^a-zA-Z]+/g, " ");

const updateProfilePictureSchema = z.object({
  objectKey: z.string().nonempty("objectKey is required"),
});

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_. ]+$/,
      "Only letters, numbers, spaces, underscores, and dots allowed",
    )
    .refine((username) => username.trim().length > 0, {
      message: "Username cannot be only spaces",
    })
    .refine((username) => !leoProfanity.check(normalize(username)), {
      message: "Username contains inappropriate language",
    }),
  bio: z
    .string()
    .max(200, "Bio must be at most 200 characters")
    .refine((bio) => (bio ? !leoProfanity.check(bio) : true), {
      message: "Bio contains inappropriate language",
    }),
});

const saveInterestsSchema = z.object({
  interests: z
    .array(z.nativeEnum(Interest))
    .nonempty({ message: "You must select at least one interest" }),
});

const updateNotificationSettingsSchema = z
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

const markNotificationsAsSeenSchema = z.object({
  notificationIds: z
    .array(z.string("Only strings allowed as notification ids"))
    .max(100, "Max of 100 notification allowed to be passed")
    .nonempty({ message: "There must be at least one notification" }),
});

export {
  updateProfilePictureSchema,
  updateProfileSchema,
  saveInterestsSchema,
  updateNotificationSettingsSchema,
  markNotificationsAsSeenSchema,
};
