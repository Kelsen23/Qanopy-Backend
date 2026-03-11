import Anthropic from "@anthropic-ai/sdk";

import dotenv from "dotenv";
dotenv.config();

const embeddingApiKey = process.env.ANTHROPIC_API_KEY_EMBEDDING;

const embeddingClient = new Anthropic({ apiKey: embeddingApiKey });

export { embeddingClient };
