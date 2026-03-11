import Anthropic from "@anthropic-ai/sdk";

import dotenv from "dotenv";
dotenv.config();

const embeddingsApiKey = process.env.ANTHROPIC_API_KEY_EMBEDDINGS;

const embeddingsClient = new Anthropic({ apiKey: embeddingsApiKey });

export { embeddingsClient };
