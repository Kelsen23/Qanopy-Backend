import { lookup as nodeLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { GotScrapingHttpClient } from "crawlee";

import type { KnowledgeBaseCrawlSource } from "../../types/knowledgeBaseCrawl.type.js";
import {
  assertPublicUrl,
  isHostAllowed,
  isPublicAddress,
  normalizeUrl,
} from "./knowledgeBaseUrlPolicy.util.js";

type UrlScope = "PATH" | "HOST" | "ANY";

const httpClient = new GotScrapingHttpClient();

const safeDnsLookup: LookupFunction = (hostname, options, callback) => {
  nodeLookup(hostname, options, (error, address, family) => {
    if (error) {
      callback(error, address, family);
      return;
    }

    const addresses = Array.isArray(address) ? address : [{ address, family }];
    const hasUnsafeAddress = addresses.some(
      ({ address }) => !isPublicAddress(address),
    );

    if (hasUnsafeAddress) {
      callback(new Error("Private or reserved DNS result"), "", 0);
      return;
    }

    callback(null, address, family);
  });
};

const validateScopedUrl = async (
  rawUrl: string,
  source: KnowledgeBaseCrawlSource,
  scope: UrlScope,
) => {
  const normalizedUrl = normalizeUrl(rawUrl);

  if (!normalizedUrl) {
    throw new Error(`Invalid HTTP URL: ${rawUrl}`);
  }

  if (scope === "HOST" && !isHostAllowed(normalizedUrl.hostname, source)) {
    throw new Error(`URL host rejected by crawl policy: ${rawUrl}`);
  }

  return assertPublicUrl(
    normalizedUrl.toString(),
    scope === "PATH" ? source : undefined,
  );
};

const fetchBoundedText = async (
  rawUrl: string,
  source: KnowledgeBaseCrawlSource,
  maxBytes: number,
  scope: UrlScope = "PATH",
  deadlineAt = Number.POSITIVE_INFINITY,
) => {
  let url = await validateScopedUrl(rawUrl, source, scope);

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const remainingMs = deadlineAt - Date.now();

    if (remainingMs <= 0) {
      throw new Error("Knowledge Base crawl duration reached");
    }

    const response = await httpClient.sendRequest({
      url,
      followRedirect: false,
      throwHttpErrors: false,
      maxRedirects: 0,
      timeout: { request: Math.max(1, Math.min(15_000, remainingMs)) },
      responseType: "buffer",
      maxResponseSize: maxBytes,
      dnsLookup: safeDnsLookup,
      headers: { "user-agent": source.crawl.userAgent },
    });

    if (isRedirect(response.statusCode)) {
      const location = getHeaderValue(response.headers.location);

      if (!location) {
        throw new Error(`Redirect without Location from ${url}`);
      }

      url = await validateScopedUrl(
        new URL(location, url).toString(),
        source,
        scope,
      );
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return { status: response.statusCode, text: "", url: url.toString() };
    }

    return {
      status: response.statusCode,
      text: Buffer.from(response.body).toString("utf8"),
      url: url.toString(),
    };
  }

  throw new Error(`Too many redirects from ${rawUrl}`);
};

const isRedirect = (statusCode: number) =>
  statusCode >= 300 && statusCode < 400;

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export { fetchBoundedText, getHeaderValue, safeDnsLookup };
