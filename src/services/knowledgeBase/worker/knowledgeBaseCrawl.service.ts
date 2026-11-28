import { randomUUID } from "node:crypto";

import type {
  KnowledgeBaseCrawlCounts,
  KnowledgeBaseCrawlSource,
} from "../../../types/knowledgeBaseCrawl.type.js";

import { crawlKnowledgeBasePages } from "../knowledgeBasePageCrawler.service.js";
import {
  claimKnowledgeBaseCrawlLease,
  releaseKnowledgeBaseCrawlLease,
  renewKnowledgeBaseCrawlLease,
} from "../knowledgeBaseCrawlLease.service.js";

import KnowledgeSource from "../../../models/knowledgeSource.model.js";
import knowledgeBaseCrawlQueue from "../../../queues/knowledgeBase/knowledgeBaseCrawl.queue.js";

type CrawlStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

const heartbeatIntervalMs = 20_000;

const crawlKnowledgeBaseSource = async (sourceId: string) => {
  const runId = randomUUID();
  const claim = await claimKnowledgeBaseCrawlLease(sourceId, runId);

  if (!claim.source || !claim.token) {
    return { status: claim.coalesced ? "COALESCED" : "SKIPPED" };
  }

  const source = claim.source.toObject() as unknown as KnowledgeBaseCrawlSource;
  const startedAt = Date.now();
  const deadlineAt = startedAt + source.crawl.maxDurationSeconds * 1000;
  const counts: KnowledgeBaseCrawlCounts = createEmptyCrawlCounts();
  const leaseState = { lost: false };
  let status: CrawlStatus = "SUCCEEDED";
  let runError: string | undefined;

  const heartbeat = setInterval(() => {
    renewKnowledgeBaseCrawlLease(sourceId, claim.token!).catch((error) => {
      leaseState.lost = true;

      console.error("Knowledge Base crawl lease renewal failed:", error);
    });
  }, heartbeatIntervalMs);

  try {
    const result = await crawlKnowledgeBasePages(
      source,
      runId,
      claim.token,
      deadlineAt,
      leaseState,
      counts,
    );
    status = getCompletedStatus(counts, result.timedOut);
  } catch (error) {
    status = counts.pagesFetched > 0 ? "PARTIAL" : "FAILED";
    runError = error instanceof Error ? error.message : String(error);
  } finally {
    clearInterval(heartbeat);
    await finishCrawl(
      sourceId,
      claim.token,
      runId,
      startedAt,
      status,
      runError,
      counts,
    );
  }

  return { status, runId, ...counts, error: runError };
};

const createEmptyCrawlCounts = (): KnowledgeBaseCrawlCounts => ({
  pagesDiscovered: 0,
  pagesFetched: 0,
  pagesExtracted: 0,
  pagesChanged: 0,
  pagesFailed: 0,
});

const getCompletedStatus = (
  counts: KnowledgeBaseCrawlCounts,
  timedOut: boolean,
): CrawlStatus => {
  if (counts.pagesFailed > 0 || timedOut) {
    return counts.pagesExtracted > 0 ? "PARTIAL" : "FAILED";
  }

  return "SUCCEEDED";
};

const finishCrawl = async (
  sourceId: string,
  leaseToken: string,
  runId: string,
  startedAt: number,
  status: CrawlStatus,
  error: string | undefined,
  counts: KnowledgeBaseCrawlCounts,
) => {
  await releaseKnowledgeBaseCrawlLease(sourceId, leaseToken, {
    startedAt: new Date(startedAt),
    completedAt: new Date(),
    status,
    runId,
    error,
    ...counts,
    durationMs: Date.now() - startedAt,
  });

  await enqueueCoalescedCrawlIfRequested(sourceId);
};

const enqueueCoalescedCrawlIfRequested = async (sourceId: string) => {
  const source = await KnowledgeSource.findById(sourceId)
    .select("enabled crawlExecution.pendingRunRequestedAt")
    .lean();
  const requestedAt = source?.crawlExecution?.pendingRunRequestedAt;

  if (!source?.enabled || !requestedAt) {
    return;
  }

  await knowledgeBaseCrawlQueue.add(
    "crawl-source",
    { sourceId },
    {
      jobId: `knowledgeBaseCrawl:coalesced:${sourceId}:${new Date(requestedAt).getTime()}`,
      removeOnComplete: true,
    },
  );

  await KnowledgeSource.updateOne(
    { _id: sourceId, "crawlExecution.pendingRunRequestedAt": requestedAt },
    { $unset: { "crawlExecution.pendingRunRequestedAt": 1 } },
  );
};

export { crawlKnowledgeBaseSource };
