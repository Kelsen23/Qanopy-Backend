import { randomUUID } from "node:crypto";

import KnowledgeSource from "../../models/knowledgeSource.model.js";

const crawlLeaseMs = 60_000;

const claimKnowledgeBaseCrawlLease = async (
  sourceId: string,
  runId: string,
) => {
  const now = new Date();
  const token = randomUUID();
  const source = await KnowledgeSource.findOneAndUpdate(
    {
      _id: sourceId,
      enabled: true,
      $or: [
        { "crawlExecution.leaseExpiresAt": { $exists: false } },
        { "crawlExecution.leaseExpiresAt": null },
        { "crawlExecution.leaseExpiresAt": { $lte: now } },
      ],
    },
    {
      $set: {
        "crawlExecution.leaseToken": token,
        "crawlExecution.leaseExpiresAt": new Date(now.getTime() + crawlLeaseMs),
        "lastCrawl.startedAt": now,
        "lastCrawl.status": "RUNNING",
        "lastCrawl.runId": runId,
      },
    },
    { new: true },
  );

  if (source) {
    return { source, token, coalesced: false };
  }

  const enabledSource = await KnowledgeSource.exists({
    _id: sourceId,
    enabled: true,
  });

  if (!enabledSource) {
    return { source: null, token: null, coalesced: false };
  }

  await KnowledgeSource.updateOne(
    {
      _id: sourceId,
      enabled: true,
      "crawlExecution.pendingRunRequestedAt": { $exists: false },
    },
    { $set: { "crawlExecution.pendingRunRequestedAt": now } },
  );

  return { source: null, token: null, coalesced: true };
};

const renewKnowledgeBaseCrawlLease = async (
  sourceId: string,
  token: string,
) => {
  const result = await KnowledgeSource.updateOne(
    { _id: sourceId, "crawlExecution.leaseToken": token },
    {
      $set: {
        "crawlExecution.leaseExpiresAt": new Date(Date.now() + crawlLeaseMs),
      },
    },
  );

  if (result.matchedCount !== 1) {
    throw new Error(`Crawl lease lost for Knowledge Source ${sourceId}`);
  }
};

const releaseKnowledgeBaseCrawlLease = async (
  sourceId: string,
  token: string,
  lastCrawl: Record<string, unknown>,
) =>
  KnowledgeSource.updateOne(
    { _id: sourceId, "crawlExecution.leaseToken": token },
    {
      $set: { lastCrawl },
      $unset: {
        "crawlExecution.leaseToken": 1,
        "crawlExecution.leaseExpiresAt": 1,
      },
    },
  );

export {
  claimKnowledgeBaseCrawlLease,
  releaseKnowledgeBaseCrawlLease,
  renewKnowledgeBaseCrawlLease,
};
