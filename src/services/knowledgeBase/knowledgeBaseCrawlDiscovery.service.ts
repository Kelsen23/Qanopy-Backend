import { RobotsTxtFile, parseSitemap } from "crawlee";

import type {
  CrawlDiscovery,
  KnowledgeBaseCrawlSource,
} from "../../types/knowledgeBaseCrawl.type.js";

import { fetchBoundedText } from "../../utils/knowledgeBase/knowledgeBaseCrawlHttp.util.js";
import {
  isHostAllowed,
  isUrlAllowed,
  normalizeUrl,
} from "../../utils/knowledgeBase/knowledgeBaseUrlPolicy.util.js";

const maxSitemapCount = 50;
const maxSitemapDepth = 2;
const maxSitemapResponseBytes = 5 * 1024 * 1024;
const robotsResponseLimitBytes = 512 * 1024;

const loadKnowledgeBaseRobotsFile = async (
  source: KnowledgeBaseCrawlSource,
  origin: string,
  deadlineAt: number,
) => {
  const robotsUrl = new URL("/robots.txt", origin).toString();

  try {
    const response = await fetchBoundedText(
      robotsUrl,
      source,
      robotsResponseLimitBytes,
      "HOST",
      deadlineAt,
    );

    if (response.status >= 500) {
      return null;
    }

    const contents = response.status === 200 ? response.text : "";

    return RobotsTxtFile.from(robotsUrl, contents);
  } catch (error) {
    console.warn(
      `[knowledgeBaseCrawl] Could not load robots.txt for ${origin}:`,
      error,
    );
    return null;
  }
};

const collectRootRobots = async (
  source: KnowledgeBaseCrawlSource,
  deadlineAt: number,
  robotsByOrigin: CrawlDiscovery["robotsByOrigin"],
  pendingSitemaps: string[],
) => {
  for (const rootUrl of source.rootUrls.slice(0, maxSitemapCount)) {
    const root = normalizeUrl(rootUrl);
    if (!root) {
      continue;
    }

    const robots = await loadKnowledgeBaseRobotsFile(
      source,
      root.origin,
      deadlineAt,
    );
    robotsByOrigin.set(root.origin, robots);
    if (!robots) {
      continue;
    }

    const remainingSitemapSlots = maxSitemapCount - pendingSitemaps.length;
    pendingSitemaps.push(
      ...robots.getSitemaps().slice(0, remainingSitemapSlots),
    );
  }
};

const collectSitemapUrls = async (
  source: KnowledgeBaseCrawlSource,
  deadlineAt: number,
  pendingSitemaps: string[],
  discoveredUrls: Set<string>,
) => {
  const seenSitemaps = new Set<string>();

  while (
    pendingSitemaps.length > 0 &&
    seenSitemaps.size < maxSitemapCount &&
    discoveredUrls.size < source.crawl.maxPages &&
    Date.now() < deadlineAt
  ) {
    const rawSitemapUrl = pendingSitemaps.shift();

    if (!rawSitemapUrl) {
      break;
    }

    const sitemapUrl = normalizeUrl(rawSitemapUrl);

    if (!sitemapUrl || !isHostAllowed(sitemapUrl.hostname, source)) {
      continue;
    }

    if (seenSitemaps.has(sitemapUrl.toString())) {
      continue;
    }

    seenSitemaps.add(sitemapUrl.toString());

    try {
      const response = await fetchBoundedText(
        sitemapUrl.toString(),
        source,
        Math.min(source.crawl.maxResponseBytes, maxSitemapResponseBytes),
        "HOST",
        deadlineAt,
      );

      if (response.status !== 200) {
        continue;
      }

      await collectSitemapEntries(
        response.text,
        source,
        pendingSitemaps,
        discoveredUrls,
      );
    } catch (error) {
      console.warn(
        `[knowledgeBaseCrawl] Sitemap parse failed for ${sitemapUrl}:`,
        error,
      );
    }
  }
};

const collectSitemapEntries = async (
  xml: string,
  source: KnowledgeBaseCrawlSource,
  pendingSitemaps: string[],
  discoveredUrls: Set<string>,
) => {
  for await (const entry of parseSitemap(
    [{ type: "raw", content: xml }],
    undefined,
    { emitNestedSitemaps: true, maxDepth: maxSitemapDepth },
  )) {
    if (entry.originSitemapUrl === null) {
      if (pendingSitemaps.length < maxSitemapCount) {
        pendingSitemaps.push(entry.loc);
      }

      continue;
    }

    if (discoveredUrls.size >= source.crawl.maxPages) {
      break;
    }

    if (!isUrlAllowed(entry.loc, source)) {
      continue;
    }

    const normalizedUrl = normalizeUrl(entry.loc);
    if (normalizedUrl) {
      discoveredUrls.add(normalizedUrl.toString());
    }
  }
};

const discoverKnowledgeBaseUrls = async (
  source: KnowledgeBaseCrawlSource,
  deadlineAt: number,
): Promise<CrawlDiscovery> => {
  const urls = new Set<string>();
  const robotsByOrigin: CrawlDiscovery["robotsByOrigin"] = new Map();
  const pendingSitemaps = (source.discovery?.sitemapUrls ?? []).slice(
    0,
    maxSitemapCount,
  );

  await collectRootRobots(source, deadlineAt, robotsByOrigin, pendingSitemaps);

  addAllowedRoots(source, urls);
  await collectSitemapUrls(source, deadlineAt, pendingSitemaps, urls);

  return { urls, robotsByOrigin };
};

const addAllowedRoots = (
  source: KnowledgeBaseCrawlSource,
  urls: Set<string>,
) => {
  for (const rootUrl of source.rootUrls) {
    if (urls.size >= source.crawl.maxPages) {
      return;
    }

    const root = normalizeUrl(rootUrl);
    if (root && isUrlAllowed(root.toString(), source)) {
      urls.add(root.toString());
    }
  }
};

export { discoverKnowledgeBaseUrls, loadKnowledgeBaseRobotsFile };
