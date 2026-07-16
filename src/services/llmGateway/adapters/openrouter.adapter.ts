import OpenAI from "openai";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

import type {
  LLMAdapter,
  LLMAdapterGenerateOptions,
  LLMAdapterStreamTextOptions,
  LLMMessage,
  LLMReasoningOptions,
  LLMUsage,
} from "../llmGateway.types.js";
import { getProviderCapabilities } from "../llmGateway.capabilities.js";

type OpenRouterTextContent = {
  type: "text";
  text: string;
  cache_control?: {
    type: "ephemeral";
  };
};

const toOpenRouterMessages = (messages: LLMMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.cache?.enabled
      ? ([
          {
            type: "text",
            text: message.content,
            cache_control: { type: "ephemeral" },
          },
        ] satisfies OpenRouterTextContent[])
      : message.content,
  }));

type OpenRouterUsage = NonNullable<
  ChatCompletion["usage"] | ChatCompletionChunk["usage"]
>;

type OpenRouterPromptTokensDetails = NonNullable<
  OpenRouterUsage["prompt_tokens_details"]
> & {
  cache_write_tokens?: number;
};

const toUsage = (usage?: OpenRouterUsage): LLMUsage => {
  const promptDetails = usage?.prompt_tokens_details as
    | OpenRouterPromptTokensDetails
    | undefined;

  return {
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    cacheReadTokens: promptDetails?.cached_tokens,
    cacheCreationTokens: promptDetails?.cache_write_tokens,
  };
};

const buildOpenRouterReasoning = (reasoning?: LLMReasoningOptions) => {
  if (!reasoning?.effort) return undefined;

  return { effort: reasoning.effort === "max" ? "xhigh" : reasoning.effort };
};

const buildResponseFormat = (
  mode: LLMAdapterGenerateOptions["mode"],
  schema?: LLMAdapterGenerateOptions["schema"],
) => {
  if (mode !== "json") return undefined;
  if (!schema) return { type: "json_object" as const };

  return {
    type: "json_schema" as const,
    json_schema: {
      name: "llm_gateway_response",
      schema: z.toJSONSchema(schema) as { [key: string]: unknown },
      strict: true,
    },
  };
};

const openrouterAdapter: LLMAdapter = {
  capabilities: getProviderCapabilities("openrouter"),

  generate: async ({
    apiKey,
    route,
    messages,
    mode,
    schema,
    temperature,
    maxTokens,
    cache,
    reasoning,
  }: LLMAdapterGenerateOptions) => {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const promptCacheEnabled = Boolean(cache?.enabled);
    const request = {
      model: route.model,
      messages: toOpenRouterMessages(messages),
      temperature,
      max_completion_tokens: maxTokens,
      response_format: buildResponseFormat(mode, schema),
      ...(buildOpenRouterReasoning(reasoning)
        ? { reasoning: buildOpenRouterReasoning(reasoning) }
        : {}),
      ...(promptCacheEnabled
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    };

    const response = await client.chat.completions.create(request);
    const usage = toUsage(response.usage);

    return {
      text: response.choices[0]?.message?.content ?? "",
      usage,
      cacheHit: Boolean(usage.cacheReadTokens && usage.cacheReadTokens > 0),
      routedModel: response.model,
    };
  },

  streamText: async ({
    apiKey,
    route,
    messages,
    temperature,
    maxTokens,
    onToken,
    cache,
    reasoning,
  }: LLMAdapterStreamTextOptions) => {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const promptCacheEnabled = Boolean(cache?.enabled);
    const request = {
      model: route.model,
      messages: toOpenRouterMessages(messages),
      temperature,
      max_completion_tokens: maxTokens,
      stream: true as const,
      stream_options: { include_usage: true },
      ...(buildOpenRouterReasoning(reasoning)
        ? { reasoning: buildOpenRouterReasoning(reasoning) }
        : {}),
      ...(promptCacheEnabled
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    };

    const stream = await client.chat.completions.create(request);
    let usage: LLMUsage = {};
    let routedModel: string | undefined;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      usage = chunk.usage ? toUsage(chunk.usage) : usage;
      routedModel = chunk.model ?? routedModel;

      if (token) await onToken(token);
    }

    return {
      text: "",
      usage,
      cacheHit: Boolean(usage.cacheReadTokens && usage.cacheReadTokens > 0),
      routedModel,
    };
  },
};

export default openrouterAdapter;
