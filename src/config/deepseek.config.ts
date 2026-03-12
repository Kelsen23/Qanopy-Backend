import OpenAI from "openai";

import dotenv from "dotenv";
dotenv.config();

const suggestionGenerationApiKey =
  process.env.DEEPSEEK_API_KEY_SUGGESTION_GENERATION;

const suggestionGenerationClient = new OpenAI({
  apiKey: suggestionGenerationApiKey,
  baseURL: "https://api.deepseek.com/v1",
});

export { suggestionGenerationClient };
