import { z } from "zod";

const updateQuestionSettingsSchema = z
  .object({
    aiAnswerAutoGeneration: z.boolean(),
  })
  .strict();

export { updateQuestionSettingsSchema };
