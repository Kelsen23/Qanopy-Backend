import { z } from "zod";

import { requiredString } from "./shared.js";

const mongodbEnvSchema = z.object({
  MONGO_URI: requiredString("MONGO_URI"),
  MONGO_ATLAS_RECOMMENDED_QUESTIONS_INDEX: requiredString(
    "MONGO_ATLAS_RECOMMENDED_QUESTIONS_INDEX",
  ),
  MONGO_ATLAS_QUESTION_AUTOCOMPLETE_INDEX: requiredString(
    "MONGO_ATLAS_QUESTION_AUTOCOMPLETE_INDEX",
  ),
  MONGO_ATLAS_QUESTION_SEARCH_INDEX: requiredString(
    "MONGO_ATLAS_QUESTION_SEARCH_INDEX",
  ),
  MONGO_ATLAS_QUESTION_VECTOR_SEARCH_INDEX: requiredString(
    "MONGO_ATLAS_QUESTION_VECTOR_SEARCH_INDEX",
  ),
});

const mongodbConfigSchema = mongodbEnvSchema.transform((env) => ({
  mongoUri: env.MONGO_URI,
  recommendedQuestionsIndexName: env.MONGO_ATLAS_RECOMMENDED_QUESTIONS_INDEX,
  questionAutocompleteIndexName: env.MONGO_ATLAS_QUESTION_AUTOCOMPLETE_INDEX,
  questionSearchIndexName: env.MONGO_ATLAS_QUESTION_SEARCH_INDEX,
  questionVectorSearchIndexName: env.MONGO_ATLAS_QUESTION_VECTOR_SEARCH_INDEX,
}));

export { mongodbConfigSchema, mongodbEnvSchema };
