import KnowledgeSource from "../../models/knowledgeSource.model.js";
import knowledgeBaseCrawlQueue from "../../queues/knowledgeBase/knowledgeBaseCrawl.queue.js";

const reconcilePendingKnowledgeBaseCrawlRuns = async () => {
  const sources = await KnowledgeSource.find({
    enabled: true,
    "crawlExecution.pendingRunRequestedAt": { $exists: true },
  })
    .select("_id crawlExecution.pendingRunRequestedAt")
    .lean();

  let queuedRuns = 0;

  for (const source of sources) {
    const sourceId = source._id.toString();
    const requestedAt = source.crawlExecution?.pendingRunRequestedAt;

    if (!requestedAt) {
      continue;
    }

    const jobId = `knowledgeBaseCrawl:coalesced:${sourceId}:${requestedAt.getTime()}`;

    await knowledgeBaseCrawlQueue.add(
      "crawl-source",
      { sourceId },
      {
        jobId,
        removeOnComplete: true,
      },
    );

    const pendingRunFilter = {
      _id: source._id,
      "crawlExecution.pendingRunRequestedAt": requestedAt,
    };

    await KnowledgeSource.updateOne(pendingRunFilter, {
      $unset: { "crawlExecution.pendingRunRequestedAt": 1 },
    });
    queuedRuns += 1;
  }

  return { pendingSources: sources.length, queuedRuns };
};

export { reconcilePendingKnowledgeBaseCrawlRuns };
