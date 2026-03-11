import { VoyageAIClient } from "voyageai";

import dotenv from "dotenv";
dotenv.config();

const embeddingApiKey = process.env.VOYAGE_API_KEY_EMBEDDING;

const embeddingClient = new VoyageAIClient({ apiKey: embeddingApiKey });

export default embeddingClient;
