import { clearTimeout, setTimeout } from "node:timers";

import type {
  KnowledgeBaseCrawlCounts,
  KnowledgeBaseCrawlLeaseState,
  KnowledgeBaseCrawlSource,
} from "../../types/knowledgeBaseCrawl.type.js";

import { discoverKnowledgeBaseUrls } from "./knowledgeBaseCrawlDiscovery.service.js";
import { createKnowledgeBasePageCrawler } from "./knowledgeBasePageRequestHandler.service.js";
import { markKnowledgeDocumentsVerificationAttempted } from "./knowledgeBaseRevisionPersistence.service.js";

import { isUrlAllowed } from "../../utils/knowledgeBase/knowledgeBaseUrlPolicy.util.js";

import KnowledgeDocument from "../../models/knowledgeDocument.model.js";

type CrawlPageResult = {
  timedOut: boolean;
};

const crawlKnowledgeBasePages = async (
  source: KnowledgeBaseCrawlSource,
  runId: string,
  leaseToken: string,
  deadlineAt: number,
  leaseState: KnowledgeBaseCrawlLeaseState,
  counts: KnowledgeBaseCrawlCounts,
): Promise<CrawlPageResult> => {
  const discovery = await discoverKnowledgeBaseUrls(source, deadlineAt);
  const missingDocumentUrls = await getMissingDocumentsForVerification(
    source,
    leaseToken,
  );
  const discoveredUrls = new Set([...missingDocumentUrls, ...discovery.urls]);

  counts.pagesDiscovered = discoveredUrls.size;

  const seedUrls = [...discoveredUrls].slice(0, source.crawl.maxPages);
  const crawler = createKnowledgeBasePageCrawler(
    source,
    runId,
    leaseToken,
    deadlineAt,
    discovery.robotsByOrigin,
    leaseState,
    counts,
    seedUrls,
  );

  const timeout = setTimeout(
    () => crawler.stop("Configured crawl duration reached"),
    Math.max(1, deadlineAt - Date.now()),
  );

  try {
    await crawler.run(seedUrls.map((url) => ({ url, userData: { depth: 0 } })));
  } finally {
    clearTimeout(timeout);
  }

  return { timedOut: Date.now() >= deadlineAt };
};

const getMissingDocumentsForVerification = async (
  source: KnowledgeBaseCrawlSource,
  leaseToken: string,
): Promise<string[]> => {
  const verificationPageLimit = Math.floor(source.crawl.maxPages / 2);
  const documents = await KnowledgeDocument.find({
    sourceId: source._id,
    status: "MISSING_PENDING_VERIFICATION",
  })
    .sort({ lastCrawledAt: 1 })
    .limit(verificationPageLimit)
    .select("canonicalUrl")
    .lean();

  await markKnowledgeDocumentsVerificationAttempted(
    source._id.toString(),
    documents.map(({ _id }) => _id.toString()),
    leaseToken,
  );

  const urls: string[] = [];
  for (const document of documents) {
    if (!isUrlAllowed(document.canonicalUrl, source)) {
      continue;
    }

    urls.push(document.canonicalUrl);
  }

  return urls;
};

export { crawlKnowledgeBasePages };
