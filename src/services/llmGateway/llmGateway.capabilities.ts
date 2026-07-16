import type {
  LLMFeature,
  LLMProvider,
  LLMProviderCapabilities,
} from "./llmGateway.types.js";

const providerCapabilities = {
  openai: {
    textGeneration: "native",
    streaming: "native",
    embeddings: "native",
    moderation: "native",
    json: "native",
    promptCaching: "native",
    tools: "unsupported",
    reasoningEffort: "native",
  },
  anthropic: {
    textGeneration: "native",
    streaming: "native",
    embeddings: "unsupported",
    moderation: "unsupported",
    json: "native",
    promptCaching: "native",
    tools: "unsupported",
    reasoningEffort: "emulated",
  },
  openrouter: {
    textGeneration: "native",
    streaming: "native",
    embeddings: "unsupported",
    moderation: "unsupported",
    json: "native",
    promptCaching: "native",
    tools: "unsupported",
    reasoningEffort: "emulated",
  },
  voyage: {
    textGeneration: "unsupported",
    streaming: "unsupported",
    embeddings: "native",
    moderation: "unsupported",
    json: "unsupported",
    promptCaching: "unsupported",
    tools: "unsupported",
    reasoningEffort: "unsupported",
  },
} as const satisfies Record<LLMProvider, LLMProviderCapabilities>;

const featureCapability = {
  moderation: "moderation",
  questionEligibilityGate: "textGeneration",
  securityVerifier: "textGeneration",
  aiSuggestion: "textGeneration",
  aiAnswer: "textGeneration",
  embeddings: "embeddings",
} as const satisfies Record<LLMFeature, keyof LLMProviderCapabilities>;

const getProviderCapabilities = (provider: LLMProvider) =>
  providerCapabilities[provider];

const supportsCapability = (
  provider: LLMProvider,
  capability: keyof LLMProviderCapabilities,
) => providerCapabilities[provider][capability] !== "unsupported";

const supportsFeature = (provider: LLMProvider, feature: LLMFeature) =>
  supportsCapability(provider, featureCapability[feature]);

export {
  featureCapability,
  getProviderCapabilities,
  providerCapabilities,
  supportsCapability,
  supportsFeature,
};
