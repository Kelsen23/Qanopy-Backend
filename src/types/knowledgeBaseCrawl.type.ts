import type { RobotsTxtFile } from "crawlee";
import type { Types } from "mongoose";

type KnowledgeBaseCrawlSource = {
  _id: Types.ObjectId;
  publisher: string;
  sourceType: string;
  rootUrls: string[];
  allowedHosts: string[];
  allowedPathPrefixes?: string[];
  excludedPathPrefixes?: string[];
  discovery?: {
    sitemapUrls?: string[];
    includeUrlPatterns?: string[];
    excludeUrlPatterns?: string[];
  };
  crawl: {
    maxPages: number;
    maxDepth: number;
    maxConcurrency: number;
    maxRequestsPerMinute: number;
    maxDurationSeconds: number;
    maxResponseBytes: number;
    userAgent: string;
  };
  extraction: {
    contentSelectors?: string[];
    removeSelectors?: string[];
  };
  technology?: string;
  versions: string[];
};

type KnowledgeBaseCrawlCounts = {
  pagesDiscovered: number;
  pagesFetched: number;
  pagesExtracted: number;
  pagesChanged: number;
  pagesFailed: number;
};

type KnowledgeBaseCrawlLeaseState = {
  lost: boolean;
};

type CrawlDiscovery = {
  urls: Set<string>;
  robotsByOrigin: Map<string, RobotsTxtFile | null>;
};

export type {
  CrawlDiscovery,
  KnowledgeBaseCrawlCounts,
  KnowledgeBaseCrawlLeaseState,
  KnowledgeBaseCrawlSource,
};
