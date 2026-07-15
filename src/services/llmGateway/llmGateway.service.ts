import crypto from "crypto";
import { setTimeout as setTimeoutPromise } from "timers/promises";

import { z } from "zod";

import type {
  LLMAdapter,
  LLMAdapterTextResponse,
  LLMGenerateOptions,
  LLMEmbedOptions,
  LLMEmbeddingResponse,
  LLMFeature,
  LLMGenerateResponse,
  LLMMetadata,
  LLMModerationOptions,
  LLMModerationResponse,
  LLMRoute,
  LLMStreamTextOptions,
} from "./llmGateway.types.js";

import anthropicAdapter from "./adapters/anthropic.adapter.js";
import openaiAdapter from "./adapters/openai.adapter.js";
import openrouterAdapter from "./adapters/openrouter.adapter.js";
import voyageAdapter from "./adapters/voyage.adapter.js";

import {
  getLlmFeatureRoute,
  getLlmProviderApiKey,
} from "../../config/llmGateway.config.js";

const adapters: Record<LLMRoute["provider"], LLMAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  openrouter: openrouterAdapter,
  voyage: voyageAdapter,
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashPrompt = (value: unknown) =>
  crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

const parseJsonText = (text: string) => {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(withoutFence);
};

const buildMetadata = ({
  feature,
  route,
  fallbackUsed,
  promptHash,
  latencyMs,
  response,
}: {
  feature: LLMFeature;
  route: LLMRoute;
  fallbackUsed: boolean;
  promptHash: string;
  latencyMs: number;
  response: LLMAdapterTextResponse;
}): LLMMetadata => ({
  feature,
  provider: route.provider,
  model: route.model,
  fallbackUsed,
  promptHash,
  latencyMs,
  usage: response.usage ?? {},
  cost: response.cost ?? {},
  cacheHit: response.cacheHit,
  routedModel: response.routedModel,
});

const assertGenerateRequirements = <TSchema extends z.ZodTypeAny | undefined>(
  adapter: LLMAdapter,
  route: LLMRoute,
  options: LLMGenerateOptions<TSchema>,
) => {
  const reasoning = options.reasoning ?? route.reasoning;

  if (
    options.mode === "json" &&
    options.structuredOutput?.required &&
    !options.schema
  ) {
    throw new Error("Required structured output must include a schema");
  }

  if (
    options.mode === "json" &&
    options.structuredOutput?.required &&
    adapter.capabilities.json !== "native"
  ) {
    throw new Error(
      `${route.provider} does not support required native structured output`,
    );
  }

  if (
    options.cache?.required &&
    adapter.capabilities.promptCaching === "unsupported"
  ) {
    throw new Error(
      `${route.provider} does not support required prompt caching`,
    );
  }

  if (
    reasoning?.required &&
    adapter.capabilities.reasoningEffort === "unsupported"
  ) {
    throw new Error(`${route.provider} does not support required reasoning`);
  }

  if (
    reasoning?.required &&
    route.provider !== "anthropic" &&
    reasoning.budgetTokens !== undefined
  ) {
    throw new Error(
      `${route.provider} does not support required reasoning token budgets`,
    );
  }

  if (
    reasoning?.required &&
    route.provider !== "anthropic" &&
    reasoning.enabled &&
    !reasoning.effort
  ) {
    throw new Error(
      `${route.provider} does not support required adaptive reasoning`,
    );
  }
};

const assertStreamRequirements = (
  adapter: LLMAdapter,
  route: LLMRoute,
  options: LLMStreamTextOptions,
) => {
  const reasoning = options.reasoning ?? route.reasoning;

  if (
    options.cache?.required &&
    adapter.capabilities.promptCaching === "unsupported"
  ) {
    throw new Error(
      `${route.provider} does not support required prompt caching`,
    );
  }

  if (
    reasoning?.required &&
    adapter.capabilities.reasoningEffort === "unsupported"
  ) {
    throw new Error(`${route.provider} does not support required reasoning`);
  }

  if (
    reasoning?.required &&
    route.provider !== "anthropic" &&
    reasoning.budgetTokens !== undefined
  ) {
    throw new Error(
      `${route.provider} does not support required reasoning token budgets`,
    );
  }

  if (
    reasoning?.required &&
    route.provider !== "anthropic" &&
    reasoning.enabled &&
    !reasoning.effort
  ) {
    throw new Error(
      `${route.provider} does not support required adaptive reasoning`,
    );
  }
};

const callRoute = async ({
  route,
  feature,
  promptHash,
  fallbackUsed,
  timeoutMs,
  operation,
}: {
  route: LLMRoute;
  feature: LLMFeature;
  promptHash: string;
  fallbackUsed: boolean;
  timeoutMs?: number;
  operation: (...args: [LLMAdapter, string]) => Promise<LLMAdapterTextResponse>;
}) => {
  const apiKey = getLlmProviderApiKey(route.provider);

  if (!apiKey) {
    throw new Error(`Missing API key for LLM provider ${route.provider}`);
  }

  const startedAt = Date.now();
  const response = await (timeoutMs
    ? Promise.race([
        operation(adapters[route.provider], apiKey),
        setTimeoutPromise(timeoutMs).then(() => {
          throw new Error(
            `LLM request timed out after ${timeoutMs}ms for ${feature}`,
          );
        }),
      ])
    : operation(adapters[route.provider], apiKey));
  const metadata = buildMetadata({
    feature,
    route,
    fallbackUsed,
    promptHash,
    latencyMs: Date.now() - startedAt,
    response,
  });

  console.log("llmGateway.call", {
    feature,
    provider: metadata.provider,
    model: metadata.model,
    routedModel: metadata.routedModel,
    fallbackUsed,
    promptHash,
    latencyMs: metadata.latencyMs,
    usage: metadata.usage,
    cacheHit: metadata.cacheHit,
    cost: metadata.cost,
  });

  return { response, metadata };
};

const withFallback = async <T>({
  feature,
  promptHash,
  run,
}: {
  feature: LLMFeature;
  promptHash: string;
  run: (...args: [LLMRoute, boolean]) => Promise<T>;
}) => {
  const routeConfig = getLlmFeatureRoute(feature);

  try {
    return await run(routeConfig.primary, false);
  } catch (error) {
    if ((error as { noFallback?: boolean }).noFallback) throw error;

    console.error("llmGateway.primaryFailed", {
      feature,
      provider: routeConfig.primary.provider,
      model: routeConfig.primary.model,
      promptHash,
      error,
    });

    if (!routeConfig.fallback) throw error;

    return run(routeConfig.fallback, true);
  }
};

const generate = async <TSchema extends z.ZodTypeAny | undefined = undefined>(
  options: LLMGenerateOptions<TSchema>,
): Promise<
  LLMGenerateResponse<TSchema extends z.ZodTypeAny ? z.infer<TSchema> : unknown>
> => {
  const promptHash = hashPrompt({
    feature: options.feature,
    mode: options.mode,
    messages: options.messages,
  });

  return withFallback({
    feature: options.feature,
    promptHash,
    run: async (route, fallbackUsed) => {
      const { response, metadata } = await callRoute({
        route,
        feature: options.feature,
        promptHash,
        fallbackUsed,
        timeoutMs: options.timeoutMs,
        operation: (adapter, apiKey) => {
          if (!adapter.generate) {
            throw new Error(
              `${route.provider} does not support text generation`,
            );
          }

          assertGenerateRequirements(adapter, route, options);

          return adapter.generate({
            ...options,
            reasoning: options.reasoning ?? route.reasoning,
            route,
            apiKey,
          });
        },
      });

      if (options.mode === "text") {
        return {
          mode: "text",
          text: response.text,
          metadata,
        };
      }

      const parsed = parseJsonText(response.text);
      const data = options.schema ? options.schema.parse(parsed) : parsed;

      return {
        mode: "json",
        data,
        rawText: response.text,
        metadata,
      };
    },
  });
};

const embed = async (
  options: LLMEmbedOptions,
): Promise<LLMEmbeddingResponse> => {
  const feature: LLMFeature = "embeddings";
  const promptHash = hashPrompt({ feature, input: options.input });

  return withFallback({
    feature,
    promptHash,
    run: async (route, fallbackUsed) => {
      const { response, metadata } = await callRoute({
        route,
        feature,
        promptHash,
        fallbackUsed,
        timeoutMs: options.timeoutMs,
        operation: (adapter, apiKey) => {
          if (!adapter.embed) {
            throw new Error(`${route.provider} does not support embeddings`);
          }

          return adapter.embed({
            ...options,
            route,
            apiKey,
          });
        },
      });

      if (!("embedding" in response) || !Array.isArray(response.embedding)) {
        throw new Error("LLM embedding adapter returned no embedding");
      }

      return {
        embedding: response.embedding,
        metadata,
      };
    },
  });
};

const streamText = async (options: LLMStreamTextOptions) => {
  const promptHash = hashPrompt({
    feature: options.feature,
    mode: "text",
    messages: options.messages,
  });

  return withFallback({
    feature: options.feature,
    promptHash,
    run: async (route, fallbackUsed) => {
      const { metadata } = await callRoute({
        route,
        feature: options.feature,
        promptHash,
        fallbackUsed,
        timeoutMs: options.timeoutMs,
        operation: (adapter, apiKey) => {
          if (!adapter.streamText) {
            throw new Error(`${route.provider} does not support streaming`);
          }

          assertStreamRequirements(adapter, route, options);

          return adapter.streamText({
            ...options,
            reasoning: options.reasoning ?? route.reasoning,
            route,
            apiKey,
          });
        },
      });

      return metadata;
    },
  });
};

const moderate = async (
  options: LLMModerationOptions,
): Promise<LLMModerationResponse> => {
  const feature: LLMFeature = "moderation";
  const promptHash = hashPrompt({ feature, input: options.input });

  return withFallback({
    feature,
    promptHash,
    run: async (route, fallbackUsed) => {
      const { response, metadata } = await callRoute({
        route,
        feature,
        promptHash,
        fallbackUsed,
        timeoutMs: options.timeoutMs,
        operation: (adapter, apiKey) => {
          if (!adapter.moderate) {
            throw new Error(`${route.provider} does not support moderation`);
          }

          return adapter.moderate({
            ...options,
            route,
            apiKey,
          });
        },
      });

      if (!("flagged" in response) || typeof response.flagged !== "boolean") {
        throw new Error("LLM moderation adapter returned no moderation result");
      }

      const moderationResponse = response as typeof response & {
        flagged: boolean;
        categoryScores?: Record<string, number>;
      };

      return {
        flagged: moderationResponse.flagged,
        categoryScores: moderationResponse.categoryScores,
        metadata,
      };
    },
  });
};

const llmGateway = {
  embed,
  generate,
  moderate,
  streamText,
};

export { hashPrompt };
export default llmGateway;
