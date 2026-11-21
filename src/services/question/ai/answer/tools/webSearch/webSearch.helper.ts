import { createHash } from "node:crypto";

import {
  webSearchToolInputSchema,
  webSearchToolResultSchema,
} from "../../../../../../validations/question/aiAnswer/webSearch.schema.js";

import type {
  WebSearchToolInput,
  WebSearchToolResult,
} from "../../../../../../validations/question/aiAnswer/webSearch.schema.js";

const BRAVE_MAX_CONTEXT_TOKENS = 32768;
const BRAVE_MAXIMUM_NUMBER_OF_URLS = 10;
const BRAVE_MAXIMUM_QUERY_LENGTH = 600;
const BRAVE_MAX_RESPONSE_BYTES = 1000000;
const MAX_WEB_SEARCH_TITLE_LENGTH = 500;

const prepareWebSearchCall = ({
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
}): WebSearchToolResult => {
  const parsedInput = webSearchToolInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return webSearchToolResultSchema.parse({
      status: "INVALID_ARGUMENTS",
      message:
        "Invalid web search arguments. Provide a non-empty query of at most 400 characters.",
    });
  }

  if (
    !Number.isSafeInteger(callsUsed) ||
    callsUsed < 0 ||
    !Number.isSafeInteger(callLimit) ||
    callLimit < 0 ||
    !Number.isSafeInteger(evidenceTokensUsed) ||
    evidenceTokensUsed < 0 ||
    !Number.isSafeInteger(evidenceTokenLimit) ||
    evidenceTokenLimit < 0
  ) {
    throw new Error(
      "Web search usage and limits must be non-negative integers",
    );
  }

  const remainingCalls = callLimit - callsUsed;
  const remainingEvidenceTokens = evidenceTokenLimit - evidenceTokensUsed;
  const drainedLimits: Array<"calls" | "evidence_tokens"> = [];

  if (remainingCalls <= 0) drainedLimits.push("calls");
  if (remainingEvidenceTokens <= 0) drainedLimits.push("evidence_tokens");

  if (drainedLimits.length > 0) {
    return webSearchToolResultSchema.parse({
      status: "LIMITS_DRAINED",
      drainedLimits,
      message: `Web search ${drainedLimits.join(" and ")} limit reached. Continue without further web searches.`,
    });
  }

  return webSearchToolResultSchema.parse({
    status: "READY",
    remainingCalls,
    remainingEvidenceTokens,
  });
};

const createEvidenceId = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

const normalizeUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    if (
      url.username ||
      url.password ||
      url.hostname.length > 253 ||
      url.href.length > 2048
    )
      return null;

    url.hash = "";
    return url;
  } catch {
    return null;
  }
};

const readBoundedJsonResponse = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > BRAVE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
};

const hostnameMatches = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const buildBraveQuery = (input: WebSearchToolInput) => {
  const allowedDomains = input.allowedDomains ?? [];
  const excludedDomains = input.excludedDomains ?? [];
  const operators: string[] = [];

  if (allowedDomains.length > 0) {
    operators.push(
      `(${allowedDomains.map((domain) => `site:${domain}`).join(" OR ")})`,
    );
  }

  operators.push(...excludedDomains.map((domain) => `-site:${domain}`));
  const query = [input.query, ...operators].join(" ");

  if (query.length > BRAVE_MAXIMUM_QUERY_LENGTH) return null;

  return {
    query,
    constrainedDomains: allowedDomains.length > 0 || excludedDomains.length > 0,
  };
};

const toIsoDate = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;

  const timestamp =
    typeof value === "number" ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const parseRetryAfterMs = (value: string | null, now: Date) => {
  if (!value) return undefined;

  const seconds = Number(value);
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now.getTime();
  if (!Number.isFinite(delayMs) || delayMs < 0) return undefined;

  return Math.min(Math.ceil(delayMs), 60000);
};

export {
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
};
