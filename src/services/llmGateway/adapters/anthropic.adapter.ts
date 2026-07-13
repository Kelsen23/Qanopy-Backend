import Anthropic from "@anthropic-ai/sdk";

import type {
  LLMAdapter,
  LLMAdapterGenerateOptions,
  LLMAdapterStreamTextOptions,
  LLMMessage,
} from "../llmGateway.types.js";

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

const anthropicAdapter: LLMAdapter = {
  generate: async ({
    apiKey,
    route,
    messages,
    mode,
    temperature,
    maxTokens,
  }: LLMAdapterGenerateOptions) => {
    const client = new Anthropic({ apiKey });
    const { system, conversation } = splitSystemMessages(messages);

    const response = await client.messages.create({
      model: route.model,
      max_tokens: maxTokens ?? 4096,
      temperature,
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
  }: LLMAdapterStreamTextOptions) => {
    const client = new Anthropic({ apiKey });
    const { system, conversation } = splitSystemMessages(messages);

    const stream = await client.messages.create({
      model: route.model,
      max_tokens: maxTokens ?? 4096,
      temperature,
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
