import crypto from "crypto";

import OpenAI from "openai";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

import type {
  LLMAdapter,
  LLMAdapterEmbeddingOptions,
  LLMAdapterGenerateOptions,
  LLMAdapterStreamTextOptions,
  LLMMessage,
  LLMReasoningOptions,
  LLMUsage,
} from "../llmGateway.types.js";
import { getProviderCapabilities } from "../llmGateway.capabilities.js";

const toOpenAiMessages = (messages: LLMMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

type OpenAiUsage = NonNullable<
  ChatCompletion["usage"] | ChatCompletionChunk["usage"]
>;

type OpenAiPromptTokensDetails = NonNullable<
  OpenAiUsage["prompt_tokens_details"]
> & {
  cache_write_tokens?: number;
};

const shouldUsePromptCache = ({
  cache,
  messages,
}: Pick<LLMAdapterGenerateOptions, "cache" | "messages">) =>
  Boolean(cache?.enabled || messages.some((message) => message.cache?.enabled));

const buildPromptCacheKey = ({
  feature,
  route,
  messages,
}: Pick<LLMAdapterGenerateOptions, "feature" | "route" | "messages">) => {
  const cacheableMessages = messages.filter((message) => message.cache?.enabled);
  const keySource = cacheableMessages.length > 0 ? cacheableMessages : messages;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(keySource))
    .digest("hex")
    .slice(0, 32);

  return `${feature}:${route.model}:${hash}`;
};

const toUsage = (usage?: OpenAiUsage): LLMUsage => {
  const promptDetails = usage?.prompt_tokens_details as
    | OpenAiPromptTokensDetails
    | undefined;

  return {
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    cacheReadTokens: promptDetails?.cached_tokens,
    cacheCreationTokens: promptDetails?.cache_write_tokens,
  };
};

const toOpenAiReasoningEffort = (reasoning?: LLMReasoningOptions) => {
  if (!reasoning?.effort) return undefined;

  return reasoning.effort === "max" ? "xhigh" : reasoning.effort;
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

const openaiAdapter: LLMAdapter = {
  capabilities: getProviderCapabilities("openai"),

  generate: async ({
    apiKey,
    route,
    feature,
    messages,
    mode,
    schema,
    temperature,
    maxTokens,
    cache,
    reasoning,
  }: LLMAdapterGenerateOptions) => {
    const client = new OpenAI({ apiKey });
    const promptCacheEnabled = shouldUsePromptCache({ cache, messages });

    const response = await client.chat.completions.create({
      model: route.model,
      messages: toOpenAiMessages(messages),
      temperature,
      max_tokens: maxTokens,
      response_format: buildResponseFormat(mode, schema),
      reasoning_effort: toOpenAiReasoningEffort(reasoning),
      prompt_cache_key: promptCacheEnabled
        ? buildPromptCacheKey({ feature, route, messages })
        : undefined,
    });
    const usage = toUsage(response.usage);

    return {
      text: response.choices[0]?.message?.content ?? "",
      usage,
      cacheHit: Boolean(usage.cacheReadTokens && usage.cacheReadTokens > 0),
    };
  },

  moderate: async ({ apiKey, route, input }) => {
    const client = new OpenAI({ apiKey });

    const response = await client.moderations.create({
      model: route.model,
      input,
    });

    const result = response.results?.[0];

    if (!result) {
      throw new Error("OpenAI moderation returned no result");
    }

    return {
      text: "",
      flagged: result.flagged,
      categoryScores: result.category_scores as unknown as Record<
        string,
        number
      >,
    };
  },

  embed: async ({ apiKey, route, input }: LLMAdapterEmbeddingOptions) => {
    const client = new OpenAI({ apiKey });

    const response = await client.embeddings.create({
      model: route.model,
      input,
    });
    const embedding = response.data[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("OpenAI embedding returned no embedding");
    }

    return {
      text: "",
      embedding,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
  },

  streamText: async ({
    apiKey,
    route,
    feature,
    messages,
    temperature,
    maxTokens,
    onToken,
    cache,
    reasoning,
  }: LLMAdapterStreamTextOptions) => {
    const client = new OpenAI({ apiKey });
    const promptCacheEnabled = shouldUsePromptCache({ cache, messages });

    const stream = await client.chat.completions.create({
      model: route.model,
      messages: toOpenAiMessages(messages),
      temperature,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: toOpenAiReasoningEffort(reasoning),
      prompt_cache_key: promptCacheEnabled
        ? buildPromptCacheKey({ feature, route, messages })
        : undefined,
    });
    let usage: LLMUsage = {};

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      usage = chunk.usage ? toUsage(chunk.usage) : usage;

      if (token) await onToken(token);
    }

    return {
      text: "",
      usage,
      cacheHit: Boolean(usage.cacheReadTokens && usage.cacheReadTokens > 0),
    };
  },
};

export default openaiAdapter;
