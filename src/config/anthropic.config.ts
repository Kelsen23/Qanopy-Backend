import Anthropic from "@anthropic-ai/sdk";

import dotenv from "dotenv";
dotenv.config();

const answerGenerationApiKey = process.env.ANTHROPIC_API_KEY_ANSWER_GENERATION;

const answerGenerationClient = new Anthropic({
  apiKey: answerGenerationApiKey,
});

export default answerGenerationClient;
