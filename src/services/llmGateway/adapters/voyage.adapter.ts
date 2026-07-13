import { createRequire } from "module";

import type { LLMAdapter } from "../llmGateway.types.js";
import { getProviderCapabilities } from "../llmGateway.capabilities.js";

const require = createRequire(import.meta.url);
const { VoyageAIClient } = require("voyageai");

const voyageAdapter: LLMAdapter = {
  capabilities: getProviderCapabilities("voyage"),

  embed: async ({ apiKey, route, input, inputType }) => {
    const client = new VoyageAIClient({ apiKey });

    const response = await client.embed({
      input,
      model: route.model,
      inputType: inputType ?? "query",
    });

    const embedding = response.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Failed to generate embedding: no embedding returned");
    }

    return {
      text: "",
      embedding,
      usage: {
        totalTokens: response.usage?.totalTokens,
      },
    };
  },
};

export default voyageAdapter;
