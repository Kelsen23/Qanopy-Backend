import dotenv from "dotenv";

import type {
  LLMFeature,
  LLMProvider,
} from "../services/llmGateway/llmGateway.types.js";

import {
  llmGatewayConfigSchema,
  supportedProviders,
} from "../validations/config.schema.js";

dotenv.config();

const llmGatewayConfig = llmGatewayConfigSchema.parse(process.env);

const getLlmFeatureRoute = (feature: LLMFeature) =>
  llmGatewayConfig.routes[feature];

const getLlmProviderApiKey = (provider: LLMProvider) =>
  llmGatewayConfig.apiKeys[provider];

const getConfiguredLlmProviders = () => {
  const providers = new Set<LLMProvider>();

  for (const route of Object.values(llmGatewayConfig.routes)) {
    providers.add(route.primary.provider);

    if (route.fallback) providers.add(route.fallback.provider);
  }

  return [...providers];
};

export {
  getConfiguredLlmProviders,
  getLlmFeatureRoute,
  getLlmProviderApiKey,
  llmGatewayConfig,
  supportedProviders,
};
