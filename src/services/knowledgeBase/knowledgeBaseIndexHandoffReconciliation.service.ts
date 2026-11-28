import KnowledgeDocumentRevision from "../../models/knowledgeDocumentRevision.model.js";
import knowledgeBaseIndexQueue from "../../queues/knowledgeBase/knowledgeBaseIndex.queue.js";

const reconcilePendingKnowledgeBaseIndexJobs = async () => {
  const pendingRevisions = await KnowledgeDocumentRevision.find({
    status: "PENDING",
  })
    .select("_id documentId sourceId")
    .lean();

  for (const revision of pendingRevisions) {
    const documentId = revision.documentId.toString();
    const revisionId = revision._id.toString();
    const sourceId = revision.sourceId.toString();

    await knowledgeBaseIndexQueue.add(
      "index-revision",
      { documentId, revisionId, sourceId },
      {
        jobId: `knowledgeBaseIndex:${revisionId}`,
        removeOnComplete: true,
      },
    );
  }

  return {
    pendingRevisions: pendingRevisions.length,
    queuedJobs: pendingRevisions.length,
  };
};

export { reconcilePendingKnowledgeBaseIndexJobs };
