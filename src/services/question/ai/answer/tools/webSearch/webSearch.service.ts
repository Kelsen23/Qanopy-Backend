import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";

import braveSearchConfig from "../../../../../../config/braveSearch.config.js";
import { getRedisCacheClient } from "../../../../../../config/redis.config.js";

import {
  BRAVE_MAX_CONTEXT_TOKENS,
  BRAVE_MAXIMUM_NUMBER_OF_URLS,
  MAX_WEB_SEARCH_TITLE_LENGTH,
  buildBraveQuery,
  createEvidenceId,
  hostnameMatches,
  normalizeUrl,
  parseRetryAfterMs,
  prepareWebSearchCall,
  readBoundedJsonResponse,
  toIsoDate,
} from "./webSearch.helper.js";

import {
  braveLlmContextResponseSchema,
  webSearchAdapterResultSchema,
  webSearchToolInputSchema,
} from "../../../../../../validations/question/aiAnswer/webSearch.schema.js";

import type {
  WebSearchAdapterResult,
  WebSearchEvidence,
  WebSearchToolInput,
  WebSearchToolExecutionResult,
} from "../../../../../../validations/question/aiAnswer/webSearch.schema.js";

const BRAVE_LLM_CONTEXT_ENDPOINT =
  "https://api.search.brave.com/res/v1/llm/context";
const BRAVE_REQUEST_TIMEOUT_MS = 10000;
const BRAVE_MIN_CONTEXT_TOKENS = 1024;
const WEB_SEARCH_RATE_LIMIT_POINTS = 40;
const WEB_SEARCH_RATE_LIMIT_DURATION_SECONDS = 1;

const webSearchRateLimiter = new RateLimiterRedis({
  storeClient: getRedisCacheClient(),
  keyPrefix: "ai-answer:web-search:provider",
  points: WEB_SEARCH_RATE_LIMIT_POINTS,
  duration: WEB_SEARCH_RATE_LIMIT_DURATION_SECONDS,
});

type WebSearchDependencies = {
  apiKey: string;
  fetcher: typeof fetch;
  now: () => Date;
  consumeRateLimit: () => Promise<void>;
};

const defaultDependencies: WebSearchDependencies = {
  apiKey: braveSearchConfig.apiKey,
  fetcher: fetch,
  now: () => new Date(),
  consumeRateLimit: async () => {
    await webSearchRateLimiter.consume("shared-provider-key");
  },
};

const executeWebSearch = async (
  {
    query,
    remainingEvidenceTokens,
    freshness,
    allowedDomains,
    excludedDomains,
  }: WebSearchToolInput & {
    remainingEvidenceTokens: number;
  },
  dependencies: WebSearchDependencies = defaultDependencies,
): Promise<WebSearchAdapterResult> => {
  const parsedInput = webSearchToolInputSchema.safeParse({
    query,
    freshness,
    allowedDomains,
    excludedDomains,
  });

  if (!parsedInput.success) {
    return webSearchAdapterResultSchema.parse({
      status: "INVALID_ARGUMENTS",
      message:
        "Invalid web search arguments. Correct the search input and try again.",
    });
  }

  if (
    !Number.isSafeInteger(remainingEvidenceTokens) ||
    remainingEvidenceTokens < 1
  ) {
    return webSearchAdapterResultSchema.parse({
      status: "BUDGET_EXHAUSTED",
      message:
        "The web search evidence-token budget is exhausted. Continue without further web evidence.",
    });
  }

  const request = buildBraveQuery(parsedInput.data);
  if (!request) {
    return webSearchAdapterResultSchema.parse({
      status: "INVALID_ARGUMENTS",
      message:
        "The combined search query and domain filters exceed the provider limit.",
    });
  }

  try {
    await dependencies.consumeRateLimit();
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return webSearchAdapterResultSchema.parse({
        status: "RATE_LIMITED",
        message:
          "Web search is temporarily rate limited. Retry after the indicated delay if budget remains.",
        retryable: true,
        retryAfterMs: error.msBeforeNext,
      });
    }

    return webSearchAdapterResultSchema.parse({
      status: "SERVICE_UNAVAILABLE",
      message:
        "Web search is temporarily unavailable because its rate limiter could not be reached. Retry later if budget remains.",
      retryable: true,
    });
  }

  const requestTokenLimit = Math.max(
    BRAVE_MIN_CONTEXT_TOKENS,
    Math.min(remainingEvidenceTokens, BRAVE_MAX_CONTEXT_TOKENS),
  );
  const freshnessCode = {
    day: "pd",
    week: "pw",
    month: "pm",
    year: "py",
  } as const;
  const requestBody: Record<string, unknown> = {
    q: request.query,
    maximum_number_of_tokens: requestTokenLimit,
    maximum_number_of_urls: BRAVE_MAXIMUM_NUMBER_OF_URLS,
    enable_source_metadata: true,
  };

  if (parsedInput.data.freshness) {
    requestBody.freshness = freshnessCode[parsedInput.data.freshness];
  }

  if (request.constrainedDomains) requestBody.operators_fallback = false;

  let response: Response;

  try {
    response = await dependencies.fetcher(BRAVE_LLM_CONTEXT_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Subscription-Token": dependencies.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(BRAVE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return webSearchAdapterResultSchema.parse({
        status: "PROVIDER_TIMEOUT",
        message: "Web search timed out. Try again later if budget remains.",
        retryable: true,
      });
    }

    return webSearchAdapterResultSchema.parse({
      status: "PROVIDER_UNAVAILABLE",
      message:
        "Web search is temporarily unavailable. Try again later if budget remains.",
      retryable: true,
    });
  }

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(
        response.headers.get("retry-after"),
        dependencies.now(),
      );
      return webSearchAdapterResultSchema.parse({
        status: "PROVIDER_RATE_LIMITED",
        message:
          "The web search provider is rate limited. Retry after the indicated delay if budget remains.",
        retryable: true,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }

    if (response.status >= 500) {
      return webSearchAdapterResultSchema.parse({
        status: "PROVIDER_UNAVAILABLE",
        message:
          "The web search provider is temporarily unavailable. Try again later if budget remains.",
        retryable: true,
      });
    }

    return webSearchAdapterResultSchema.parse({
      status: "PROVIDER_REQUEST_REJECTED",
      message:
        "The web search provider rejected the request. Check configuration and search arguments.",
      retryable: false,
    });
  }

  let rawResponse: unknown;
  try {
    rawResponse = await readBoundedJsonResponse(response);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return webSearchAdapterResultSchema.parse({
        status: "PROVIDER_TIMEOUT",
        message: "Web search timed out. Try again later if budget remains.",
        retryable: true,
      });
    }

    return webSearchAdapterResultSchema.parse({
      status: "PROVIDER_UNAVAILABLE",
      message:
        "Web search is temporarily unavailable. Try again later if budget remains.",
      retryable: true,
    });
  }

  if (rawResponse === null) {
    return webSearchAdapterResultSchema.parse({
      status: "PROVIDER_RESPONSE_INVALID",
      message:
        "The web search provider returned an unreadable response. Try again later or continue without web evidence.",
      retryable: false,
    });
  }

  const parsedResponse = braveLlmContextResponseSchema.safeParse(rawResponse);

  if (!parsedResponse.success) {
    return webSearchAdapterResultSchema.parse({
      status: "PROVIDER_RESPONSE_INVALID",
      message:
        "The web search provider returned an unsupported response. Try again later or continue without web evidence.",
      retryable: false,
    });
  }

  const retrievedAt = dependencies.now().toISOString();
  const maximumEvidenceTokens = Math.min(
    remainingEvidenceTokens,
    BRAVE_MAX_CONTEXT_TOKENS,
  );
  const sourceCandidates = new Map<
    string,
    Omit<WebSearchEvidence, "snippets" | "retrievedAt"> & {
      rawSnippets: string[];
    }
  >();
  const seenPassages = new Set<string>();
  const sources = parsedResponse.data.sources ?? {};

  for (const item of parsedResponse.data.grounding.generic) {
    const normalizedUrl = normalizeUrl(item.url);
    if (!normalizedUrl) continue;

    const hostname = normalizedUrl.hostname.toLowerCase();

    if (
      parsedInput.data.allowedDomains?.length &&
      !parsedInput.data.allowedDomains.some((domain) =>
        hostnameMatches(hostname, domain),
      )
    )
      continue;

    if (
      parsedInput.data.excludedDomains?.some((domain) =>
        hostnameMatches(hostname, domain),
      )
    )
      continue;

    let source = sourceCandidates.get(normalizedUrl.href);

    if (!source) {
      if (sourceCandidates.size >= BRAVE_MAXIMUM_NUMBER_OF_URLS) continue;

      const sourceMetadata = sources[item.url];
      const fetchedContentAt = toIsoDate(
        sourceMetadata && typeof sourceMetadata === "object"
          ? (sourceMetadata as Record<string, unknown>)
              .fetched_content_timestamp
          : undefined,
      );

      source = {
        evidenceId: createEvidenceId(normalizedUrl.href),
        title: item.title.slice(0, MAX_WEB_SEARCH_TITLE_LENGTH),
        url: normalizedUrl.href,
        sourceDomain: hostname,
        rawSnippets: [],
        ...(fetchedContentAt ? { fetchedContentAt } : {}),
      };
      sourceCandidates.set(normalizedUrl.href, source);
    }

    source.rawSnippets.push(...item.snippets);
  }

  const candidates = [...sourceCandidates.values()].filter(({ rawSnippets }) =>
    rawSnippets.some((snippet) => snippet.trim().length > 0),
  );
  const evidence: WebSearchEvidence[] = [];
  let evidenceTokensUsed = 0;

  for (const candidate of candidates) {
    const snippets: WebSearchEvidence["snippets"] = [];

    for (const text of candidate.rawSnippets) {
      const normalizedText = text.trim();
      if (!normalizedText) continue;

      const passageId = createEvidenceId(`${candidate.url}\n${normalizedText}`);
      if (seenPassages.has(passageId)) continue;

      const tokenEstimate = Math.ceil(normalizedText.length / 4);
      if (evidenceTokensUsed + tokenEstimate > maximumEvidenceTokens) continue;

      seenPassages.add(passageId);
      snippets.push({ passageId, text: normalizedText });
      evidenceTokensUsed += tokenEstimate;
    }

    if (snippets.length === 0) continue;

    const { rawSnippets: _rawSnippets, ...source } = candidate;
    evidence.push({ ...source, snippets, retrievedAt });

    if (evidenceTokensUsed >= maximumEvidenceTokens) break;
  }

  if (evidence.length === 0) {
    return webSearchAdapterResultSchema.parse({
      status: "NO_RESULTS",
      message:
        "Web search returned no usable evidence for this query. This does not establish that no evidence exists.",
    });
  }

  return webSearchAdapterResultSchema.parse({
    status: "SEARCH_COMPLETE",
    evidence,
    evidenceTokensUsed,
    retrievedAt,
  });
};

const executeWebSearchToolCall = async (
  {
    input,
    callsUsed,
    callLimit,
    evidenceTokensUsed,
    evidenceTokenLimit,
  }: {
    input: unknown;
    callsUsed: number;
    callLimit: number;
    evidenceTokensUsed: number;
    evidenceTokenLimit: number;
  },
  dependencies: WebSearchDependencies = defaultDependencies,
): Promise<WebSearchToolExecutionResult> => {
  const budgetResult = prepareWebSearchCall({
    input,
    callsUsed,
    callLimit,
    evidenceTokensUsed,
    evidenceTokenLimit,
  });

  if (budgetResult.status !== "READY") return budgetResult;

  const parsedInput = webSearchToolInputSchema.parse(input);
  return executeWebSearch(
    {
      ...parsedInput,
      remainingEvidenceTokens: budgetResult.remainingEvidenceTokens,
    },
    dependencies,
  );
};

export { executeWebSearch, executeWebSearchToolCall, prepareWebSearchCall };
export type { WebSearchDependencies };
