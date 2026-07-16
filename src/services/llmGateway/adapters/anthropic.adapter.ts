import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type {
  LLMAdapter,
  LLMAdapterGenerateOptions,
  LLMReasoningOptions,
  LLMAdapterStreamTextOptions,
  LLMMessage,
} from "../llmGateway.types.js";
import { getProviderCapabilities } from "../llmGateway.capabilities.js";

const splitSystemMessages = (messages: LLMMessage[]) => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => ({
      type: "text" as const,
      text: message.content,
      ...(message.cache?.enabled
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    }));

  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: (message.role === "assistant" ? "assistant" : "user") as
        | "assistant"
        | "user",
      content: message.content,
    }));

  return { system, conversation };
};

const extractText = (content: Anthropic.Messages.Message["content"]) =>
  content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

const buildThinkingConfig = (
  reasoning?: LLMReasoningOptions,
  maxTokens = 4096,
): Anthropic.Messages.ThinkingConfigParam | undefined => {
  if (!reasoning) return undefined;
  if (reasoning.enabled === false) return { type: "disabled" };

  if (reasoning.budgetTokens !== undefined) {
    const budgetTokens = Math.max(reasoning.budgetTokens, 1024);
    if (budgetTokens >= maxTokens) return undefined;

    return {
      type: "enabled",
      budget_tokens: budgetTokens,
      display: reasoning.display,
    };
  }

  if (reasoning.enabled) {
    return {
      type: "adaptive",
      display: reasoning.display,
    };
  }

  return undefined;
};

const buildOutputConfig = (
  mode: LLMAdapterGenerateOptions["mode"],
  schema?: LLMAdapterGenerateOptions["schema"],
  reasoning?: LLMReasoningOptions,
): Anthropic.Messages.OutputConfig | undefined => {
  const outputConfig: Anthropic.Messages.OutputConfig = {};

  if (reasoning?.effort) outputConfig.effort = reasoning.effort;

  if (mode === "json" && schema) {
    outputConfig.format = {
      type: "json_schema",
      schema: z.toJSONSchema(schema) as { [key: string]: unknown },
    };
  }

  return Object.keys(outputConfig).length > 0 ? outputConfig : undefined;
};

const anthropicAdapter: LLMAdapter = {
  capabilities: getProviderCapabilities("anthropic"),

  generate: async ({
    apiKey,
    route,
    messages,
    mode,
    schema,
    temperature,
    maxTokens,
    reasoning,
  }: LLMAdapterGenerateOptions) => {
    const client = new Anthropic({ apiKey });
    const { system, conversation } = splitSystemMessages(messages);
    const outputMaxTokens = maxTokens ?? 4096;
    const thinking = buildThinkingConfig(reasoning, outputMaxTokens);
    const outputConfig = buildOutputConfig(mode, schema, reasoning);

    const response = await client.messages.create({
      model: route.model,
      max_tokens: outputMaxTokens,
      temperature,
      thinking,
      output_config: outputConfig,
      system:
        mode === "json"
          ? [
              ...system,
              {
                type: "text",
                text: "Return only valid JSON. Do not wrap it in Markdown.",
              },
            ]
          : system,
      messages: conversation,
    });

    return {
      text: extractText(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens:
          response.usage.cache_creation_input_tokens ?? undefined,
      },
    };
  },

  streamText: async ({
    apiKey,
    route,
    messages,
    temperature,
    maxTokens,
    onToken,
    reasoning,
  }: LLMAdapterStreamTextOptions) => {
    const client = new Anthropic({ apiKey });
    const { system, conversation } = splitSystemMessages(messages);
    const outputMaxTokens = maxTokens ?? 4096;
    const thinking = buildThinkingConfig(reasoning, outputMaxTokens);
    const outputConfig = buildOutputConfig("text", undefined, reasoning);

    const stream = await client.messages.create({
      model: route.model,
      max_tokens: outputMaxTokens,
      temperature,
      thinking,
      output_config: outputConfig,
      system,
      messages: conversation,
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        await onToken(event.delta.text);
      }
    }

    return { text: "" };
  },
};

export default anthropicAdapter;
