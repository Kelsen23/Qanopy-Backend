import { setTimeout as delay } from "node:timers/promises";
import {
  CheerioCrawler,
  Configuration,
  type CheerioCrawlingContext,
  type RobotsTxtFile,
} from "crawlee";

import type {
  KnowledgeBaseCrawlCounts,
  KnowledgeBaseCrawlLeaseState,
  KnowledgeBaseCrawlSource,
} from "../../types/knowledgeBaseCrawl.type.js";

import { loadKnowledgeBaseRobotsFile } from "./knowledgeBaseCrawlDiscovery.service.js";
import {
  markKnowledgeDocumentMissing,
  persistExtractedPage,
} from "./knowledgeBaseRevisionPersistence.service.js";

import {
  getHeaderValue,
  safeDnsLookup,
} from "../../utils/knowledgeBase/knowledgeBaseCrawlHttp.util.js";
import { extractKnowledgeContent } from "../../utils/knowledgeBase/knowledgeBaseContentExtraction.util.js";
import {
  assertPublicUrl,
  isUrlAllowed,
  normalizeUrl,
} from "../../utils/knowledgeBase/knowledgeBaseUrlPolicy.util.js";

type CrawlBudget = {
  admitted: number;
  seenUrls: Set<string>;
};

const requestsByOrigin = new Map<string, number>();

const createKnowledgeBasePageCrawler = (
  source: KnowledgeBaseCrawlSource,
  runId: string,
  leaseToken: string,
  deadlineAt: number,
  robotsByOrigin: Map<string, RobotsTxtFile | null>,
  leaseState: KnowledgeBaseCrawlLeaseState,
  counts: KnowledgeBaseCrawlCounts,
  seedUrls: string[],
) => {
  const budget: CrawlBudget = {
    admitted: seedUrls.length,
    seenUrls: new Set(seedUrls),
  };

  return new CheerioCrawler(
    {
      requestHandlerTimeoutSecs: Math.min(source.crawl.maxDurationSeconds, 120),
      navigationTimeoutSecs: 30,
      maxRequestsPerCrawl: source.crawl.maxPages,
      maxRequestRetries: 0,
      maxConcurrency: source.crawl.maxConcurrency,
      maxRequestsPerMinute: source.crawl.maxRequestsPerMinute,
      respectRobotsTxtFile: false,
      preNavigationHooks: [
        async ({ request }, gotOptions) => {
          if (leaseState.lost) {
            throw new Error("Knowledge Base crawl lease was lost");
          }

          await prepareRequest(
            request.url,
            source,
            deadlineAt,
            robotsByOrigin,
            gotOptions,
          );
        },
      ],
      requestHandler: async (context) => {
        if (leaseState.lost) {
          throw new Error("Knowledge Base crawl lease was lost");
        }

        counts.pagesFetched += 1;

        const statusCode = context.response.statusCode ?? 0;
        const shouldSkipContent = await handleResponseStatus(
          context,
          statusCode,
          source,
          runId,
          leaseToken,
          counts,
          budget,
        );
        if (shouldSkipContent) {
          return;
        }

        const origin = new URL(context.request.url).origin;

        if (
          !isAllowedByRobots(
            robotsByOrigin.get(origin),
            context.request.url,
            source,
          )
        ) {
          return;
        }

        await processHtmlPage(context, source, runId, leaseToken, counts);

        await enqueuePageLinks(context, source, budget);
      },
      failedRequestHandler: async ({ request }) => {
        counts.pagesFailed += 1;
        console.warn(`[knowledgeBaseCrawl] Request failed for ${request.url}`);
      },
    },
    new Configuration({ persistStorage: false }),
  );
};

const prepareRequest = async (
  url: string,
  source: KnowledgeBaseCrawlSource,
  deadlineAt: number,
  robotsByOrigin: Map<string, RobotsTxtFile | null>,
  gotOptions: object,
) => {
  await assertPublicUrl(url, source);
  await applyRateLimit(url, source.crawl.maxRequestsPerMinute);

  setRequestOptions(gotOptions, source);

  const origin = new URL(url).origin;

  if (!robotsByOrigin.has(origin)) {
    robotsByOrigin.set(
      origin,
      await loadKnowledgeBaseRobotsFile(source, origin, deadlineAt),
    );
  }

  if (!isAllowedByRobots(robotsByOrigin.get(origin), url, source)) {
    throw new Error(`robots.txt disallows or could not be checked for ${url}`);
  }
};

const setRequestOptions = (
  options: object,
  source: KnowledgeBaseCrawlSource,
) => {
  const requestOptions = options as Record<string, unknown>;
  requestOptions.followRedirect = false;
  requestOptions.throwHttpErrors = false;
  requestOptions.maxResponseSize = source.crawl.maxResponseBytes;
  requestOptions.dnsLookup = safeDnsLookup;
  requestOptions.headers = {
    ...(requestOptions.headers as Record<string, string> | undefined),
    "user-agent": source.crawl.userAgent,
  };
};

const applyRateLimit = async (url: string, requestsPerMinute: number) => {
  const origin = new URL(url).origin;
  const requestIntervalMs = 60_000 / requestsPerMinute;
  const previousRequestAt = requestsByOrigin.get(origin) ?? 0;
  const waitMs = Math.max(
    0,
    previousRequestAt + requestIntervalMs - Date.now(),
  );

  if (waitMs > 0) {
    await delay(waitMs);
  }

  requestsByOrigin.set(origin, Date.now());
};

const isAllowedByRobots = (
  robots: RobotsTxtFile | null | undefined,
  url: string,
  source: KnowledgeBaseCrawlSource,
) => Boolean(robots?.isAllowed(url, source.crawl.userAgent));

const handleResponseStatus = async (
  context: CheerioCrawlingContext,
  statusCode: number,
  source: KnowledgeBaseCrawlSource,
  runId: string,
  leaseToken: string,
  counts: KnowledgeBaseCrawlCounts,
  budget: CrawlBudget,
) => {
  if (statusCode >= 300 && statusCode < 400) {
    await enqueueRedirect(context, source, budget);
    return true;
  }

  if (statusCode === 404 || statusCode === 410) {
    await markKnowledgeDocumentMissing(
      source._id.toString(),
      context.request.url,
      runId,
      leaseToken,
    );
    return true;
  }

  if (statusCode >= 400) {
    counts.pagesFailed += 1;
    return true;
  }

  return false;
};

const enqueueRedirect = async (
  context: CheerioCrawlingContext,
  source: KnowledgeBaseCrawlSource,
  budget: CrawlBudget,
) => {
  const location = getHeaderValue(context.response.headers.location);
  const target = location
    ? normalizeUrl(location, context.request.url)?.toString()
    : null;

  if (!target || !isUrlAllowed(target, source)) {
    return;
  }

  if (!canAdmitRequest(source, budget, target)) {
    return;
  }

  budget.seenUrls.add(target);
  budget.admitted += 1;

  await context.crawler.addRequests([
    { url: target, userData: context.request.userData },
  ]);
};

const processHtmlPage = async (
  context: CheerioCrawlingContext,
  source: KnowledgeBaseCrawlSource,
  runId: string,
  leaseToken: string,
  counts: KnowledgeBaseCrawlCounts,
) => {
  const extracted = extractKnowledgeContent(
    context.$.html(),
    context.request.url,
    source.extraction.contentSelectors ?? [],
    source.extraction.removeSelectors ?? [],
  );
  const canonicalUrl = normalizeUrl(extracted.canonicalUrl)?.toString();

  if (
    !canonicalUrl ||
    !isUrlAllowed(canonicalUrl, source) ||
    !extracted.plainText
  ) {
    counts.pagesFailed += 1;
    return;
  }

  counts.pagesExtracted += 1;
  const result = await persistExtractedPage(
    source,
    canonicalUrl,
    extracted,
    runId,
    leaseToken,
  );

  if (result.changed) {
    counts.pagesChanged += 1;
  }
};

const enqueuePageLinks = async (
  context: CheerioCrawlingContext,
  source: KnowledgeBaseCrawlSource,
  budget: CrawlBudget,
) => {
  const depth = Number(context.request.userData?.depth ?? 0);
  if (
    depth >= source.crawl.maxDepth ||
    budget.admitted >= source.crawl.maxPages
  ) {
    return;
  }

  const targets = new Set<string>();
  context.$("a[href]").each((_, element) => {
    const href = context.$(element).attr("href");
    const target = href
      ? normalizeUrl(href, context.request.url)?.toString()
      : null;
    if (
      target &&
      isUrlAllowed(target, source) &&
      !budget.seenUrls.has(target)
    ) {
      targets.add(target);
    }
  });

  const capacity = source.crawl.maxPages - budget.admitted;
  const urlsToEnqueue = [...targets].slice(0, capacity);

  if (urlsToEnqueue.length === 0) {
    return;
  }

  for (const url of urlsToEnqueue) {
    budget.seenUrls.add(url);
  }

  budget.admitted += urlsToEnqueue.length;

  await context.crawler.addRequests(
    urlsToEnqueue.map((url) => ({ url, userData: { depth: depth + 1 } })),
  );
};

const canAdmitRequest = (
  source: KnowledgeBaseCrawlSource,
  budget: CrawlBudget,
  target: string,
) => budget.admitted < source.crawl.maxPages && !budget.seenUrls.has(target);

export { createKnowledgeBasePageCrawler };
