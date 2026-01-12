import { createRequire } from "module";

import z from "zod";

import interests from "../utils/interests.util.js";

const require = createRequire(import.meta.url);
const leoProfanity = require("leo-profanity");

const normalize = (text: string) => text.replace(/[^a-zA-Z]+/g, " ");

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
    .array(z.string())
    .nonempty({ message: "You must select at least one interest" })
    .superRefine((arr, ctx) => {
      const invalid = arr.filter((i) => !interests.includes(i));
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid interests: ${invalid.join(", ")}`,
        });
      }
    }),
});

export { updateProfileSchema, saveInterestsSchema };
