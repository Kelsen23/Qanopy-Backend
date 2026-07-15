import { z } from "zod";

type LLMProvider = "openai" | "anthropic" | "openrouter" | "voyage";

type LLMMode = "text" | "json" | "embedding" | "moderation";

type LLMFeature =
  | "moderation"
  | "questionEligibilityGate"
  | "securityVerifier"
  | "aiAnswer"
  | "aiSuggestion"
  | "embeddings";

type LLMRole = "system" | "user" | "assistant";

type LLMReasoningEffort = "low" | "medium" | "high" | "max";

type LLMReasoningDisplay = "summarized" | "omitted";

type LLMReasoningOptions = {
  enabled?: boolean;
  effort?: LLMReasoningEffort;
  budgetTokens?: number;
  display?: LLMReasoningDisplay;
  required?: boolean;
};

type LLMMessage = {
  role: LLMRole;
  content: string;
  cache?: {
    enabled: boolean;
  };
};

type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

type LLMCost = {
  providerReportedUsd?: number;
  estimatedUsd?: number;
};

type LLMMetadata = {
  feature: LLMFeature;
  provider: LLMProvider;
  model: string;
  fallbackUsed: boolean;
  promptHash: string;
  latencyMs: number;
  usage: LLMUsage;
  cost: LLMCost;
  cacheHit?: boolean;
  routedModel?: string;
};

type LLMRoute = {
  provider: LLMProvider;
  model: string;
  reasoning?: LLMReasoningOptions;
};

type LLMFeatureRoute = {
  primary: LLMRoute;
  fallback?: LLMRoute;
};

type LLMGatewayConfig = {
  routes: Record<LLMFeature, LLMFeatureRoute>;
  apiKeys: Partial<Record<LLMProvider, string>>;
};

type CapabilitySupport = "native" | "emulated" | "unsupported";

type ModelCapabilities = {
  json: CapabilitySupport;
  promptCaching: CapabilitySupport;
  tools: CapabilitySupport;
  reasoningEffort: CapabilitySupport;
};

type LLMProviderCapabilities = ModelCapabilities & {
  textGeneration: CapabilitySupport;
  streaming: CapabilitySupport;
  embeddings: CapabilitySupport;
  moderation: CapabilitySupport;
};

type LLMGenerateOptions<TSchema extends z.ZodTypeAny | undefined = undefined> =
  {
    feature: LLMFeature;
    mode: Exclude<LLMMode, "embedding" | "moderation">;
    messages: LLMMessage[];
    schema?: TSchema;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    cache?: {
      enabled: boolean;
      required?: boolean;
    };
    structuredOutput?: {
      enabled: boolean;
      required?: boolean;
    };
    reasoning?: LLMReasoningOptions;
  };

type LLMTextResponse = {
  mode: "text";
  text: string;
  metadata: LLMMetadata;
};

type LLMJsonResponse<T> = {
  mode: "json";
  data: T;
  rawText: string;
  metadata: LLMMetadata;
};

type LLMGenerateResponse<T> = LLMTextResponse | LLMJsonResponse<T>;

type LLMEmbedOptions = {
  input: string;
  inputType?: "query" | "document";
  timeoutMs?: number;
};

type LLMEmbeddingResponse = {
  embedding: number[];
  metadata: LLMMetadata;
};

type LLMStreamTextOptions = Omit<
  LLMGenerateOptions,
  "mode" | "schema" | "structuredOutput"
> & {
  onToken: (...args: [string]) => Promise<void> | void;
};

type LLMAdapterGenerateOptions = Omit<
  LLMGenerateOptions<z.ZodTypeAny>,
  "schema"
> & {
  route: LLMRoute;
  apiKey: string;
  schema?: z.ZodTypeAny;
};

type LLMAdapterTextResponse = {
  text: string;
  usage?: LLMUsage;
  cost?: LLMCost;
  cacheHit?: boolean;
  routedModel?: string;
};

type LLMAdapterEmbeddingOptions = LLMEmbedOptions & {
  route: LLMRoute;
  apiKey: string;
};

type LLMModerationOptions = {
  input: string;
  timeoutMs?: number;
};

type LLMModerationCategoryScores = Record<string, number>;

type LLMModerationResponse = {
  flagged: boolean;
  categoryScores?: LLMModerationCategoryScores;
  metadata: LLMMetadata;
};

type LLMAdapterModerationOptions = LLMModerationOptions & {
  route: LLMRoute;
  apiKey: string;
};

type LLMAdapterStreamTextOptions = LLMStreamTextOptions & {
  route: LLMRoute;
  apiKey: string;
};

type LLMAdapter = {
  capabilities: LLMProviderCapabilities;
  generate?: (
    ...args: [LLMAdapterGenerateOptions]
  ) => Promise<LLMAdapterTextResponse>;
  embed?: (
    ...args: [LLMAdapterEmbeddingOptions]
  ) => Promise<LLMAdapterTextResponse & { embedding: number[] }>;
  moderate?: (...args: [LLMAdapterModerationOptions]) => Promise<
    LLMAdapterTextResponse & {
      flagged: boolean;
      categoryScores?: LLMModerationCategoryScores;
    }
  >;
  streamText?: (
    ...args: [LLMAdapterStreamTextOptions]
  ) => Promise<LLMAdapterTextResponse>;
};

export type {
  CapabilitySupport,
  LLMAdapter,
  LLMAdapterEmbeddingOptions,
  LLMAdapterGenerateOptions,
  LLMAdapterModerationOptions,
  LLMAdapterStreamTextOptions,
  LLMAdapterTextResponse,
  LLMCost,
  LLMEmbedOptions,
  LLMEmbeddingResponse,
  LLMFeature,
  LLMFeatureRoute,
  LLMGatewayConfig,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMJsonResponse,
  LLMMessage,
  LLMMetadata,
  LLMMode,
  LLMModerationCategoryScores,
  LLMModerationOptions,
  LLMModerationResponse,
  LLMProvider,
  LLMProviderCapabilities,
  LLMReasoningDisplay,
  LLMReasoningEffort,
  LLMReasoningOptions,
  LLMRoute,
  LLMStreamTextOptions,
  LLMTextResponse,
  LLMUsage,
  ModelCapabilities,
};
