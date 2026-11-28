import { createHash } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";

import type { KnowledgeBaseCrawlSource } from "../../types/knowledgeBaseCrawl.type.js";

import type { extractKnowledgeContent } from "../../utils/knowledgeBase/knowledgeBaseContentExtraction.util.js";

import KnowledgeDocument from "../../models/knowledgeDocument.model.js";
import KnowledgeDocumentRevision from "../../models/knowledgeDocumentRevision.model.js";
import KnowledgeSource from "../../models/knowledgeSource.model.js";
import knowledgeBaseIndexQueue from "../../queues/knowledgeBase/knowledgeBaseIndex.queue.js";

type ExtractedKnowledgePage = ReturnType<typeof extractKnowledgeContent>;

const persistExtractedPage = async (
  source: KnowledgeBaseCrawlSource,
  canonicalUrl: string,
  extracted: ExtractedKnowledgePage,
  runId: string,
  leaseToken: string,
) => {
  const sourceId = source._id.toString();
  const urlHash = hash(canonicalUrl);
  const session = await mongoose.startSession();

  let transactionResult:
    | {
        changed: boolean;
        document: InstanceType<typeof KnowledgeDocument>;
        revisionId?: string;
      }
    | undefined;

  try {
    transactionResult = await session.withTransaction(async () => {
      await fenceCrawlLease(sourceId, leaseToken, session);

      let document = await KnowledgeDocument.findOne({
        sourceId,
        urlHash,
      }).session(session);

      if (!document) {
        document = new KnowledgeDocument({
          sourceId,
          canonicalUrl,
          urlHash,
          title: extracted.title,
          publisher: source.publisher,
          sourceType: source.sourceType,
          technology: source.technology,
          versions: source.versions,
          status: "DISABLED",
        });
        await document.save({ session });
      }

      const status = getRestoredDocumentStatus(
        document.status,
        document.activeRevisionId,
      );

      Object.assign(document, {
        canonicalUrl,
        status,
        title: extracted.title,
        publisher: source.publisher,
        sourceType: source.sourceType,
        technology: source.technology,
        versions: source.versions,
        lastSeenAt: new Date(),
        lastCrawledAt: new Date(),
        missingSince: undefined,
        missingConfirmationCount: 0,
        lastMissingRunId: undefined,
      });

      const existingRevision = await KnowledgeDocumentRevision.findOne({
        documentId: document._id,
        contentHash: extracted.contentHash,
      }).session(session);

      if (existingRevision) {
        await document.save({ session });
        return { changed: false, document };
      }

      const revision = await createPendingRevision(
        source,
        new Types.ObjectId(String(document._id)),
        sourceId,
        canonicalUrl,
        extracted,
        session,
      );

      const revisionId = revision._id.toString();
      document.desiredRevisionId = new Types.ObjectId(revisionId);
      await document.save({ session });

      return { changed: true, document, revisionId };
    });
  } finally {
    await session.endSession();
  }

  if (!transactionResult) {
    throw new Error(
      "Knowledge Base page persistence transaction did not complete",
    );
  }

  if (transactionResult.revisionId) {
    await enqueueRevisionIndexing(
      transactionResult.document._id.toString(),
      transactionResult.revisionId,
      sourceId,
      runId,
    );
  }

  return {
    changed: transactionResult.changed,
    document: transactionResult.document,
  };
};

const fenceCrawlLease = async (
  sourceId: string,
  leaseToken: string,
  session: ClientSession,
) => {
  const result = await KnowledgeSource.updateOne(
    {
      _id: sourceId,
      "crawlExecution.leaseToken": leaseToken,
      "crawlExecution.leaseExpiresAt": { $gt: new Date() },
    },
    { $inc: { "crawlExecution.fenceVersion": 1 } },
    { session },
  );

  if (result.matchedCount !== 1) {
    throw new Error(`Crawl lease lost for Knowledge Source ${sourceId}`);
  }
};

const markKnowledgeDocumentsVerificationAttempted = async (
  sourceId: string,
  documentIds: string[],
  leaseToken: string,
) => {
  if (documentIds.length === 0) {
    return;
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await fenceCrawlLease(sourceId, leaseToken, session);

      await KnowledgeDocument.updateMany(
        {
          _id: { $in: documentIds },
          sourceId,
          status: "MISSING_PENDING_VERIFICATION",
        },
        { $set: { lastCrawledAt: new Date() } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
};

const getRestoredDocumentStatus = (
  status: unknown,
  activeRevisionId: unknown,
) => {
  if (status !== "MISSING_PENDING_VERIFICATION") {
    return status;
  }

  return activeRevisionId ? "ACTIVE" : "DISABLED";
};

const createPendingRevision = async (
  source: KnowledgeBaseCrawlSource,
  documentId: Types.ObjectId,
  sourceId: string,
  canonicalUrl: string,
  extracted: ExtractedKnowledgePage,
  session: ClientSession,
): Promise<{ _id: Types.ObjectId }> => {
  const latestRevision = await KnowledgeDocumentRevision.findOne({ documentId })
    .sort({ revisionNumber: -1 })
    .select("revisionNumber")
    .session(session)
    .lean();

  const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

  const revision = new KnowledgeDocumentRevision({
    documentId,
    sourceId,
    revisionNumber,
    canonicalUrl,
    title: extracted.title,
    publisher: source.publisher,
    sourceType: source.sourceType,
    technology: source.technology,
    versions: source.versions,
    retrievedAt: new Date(),
    contentHash: extracted.contentHash,
    extractionVersion: "html-blocks-v1",
    content: extracted.blocks,
    plainText: extracted.plainText,
    status: "PENDING",
  });

  await revision.save({ session });

  return revision;
};

const enqueueRevisionIndexing = async (
  documentId: string,
  revisionId: string,
  sourceId: string,
  runId: string,
) => {
  await knowledgeBaseIndexQueue.add(
    "index-revision",
    { documentId, revisionId, sourceId, runId },
    { jobId: `knowledgeBaseIndex:${revisionId}`, removeOnComplete: true },
  );
};

const markKnowledgeDocumentMissing = async (
  sourceId: string,
  url: string,
  runId: string,
  leaseToken: string,
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await fenceCrawlLease(sourceId, leaseToken, session);

      const document = await KnowledgeDocument.findOne({
        sourceId,
        urlHash: hash(url),
      }).session(session);

      if (!document || document.status === "REMOVED") {
        return;
      }

      if (document.lastMissingRunId !== runId) {
        document.missingConfirmationCount =
          Number(document.missingConfirmationCount ?? 0) + 1;
        document.lastMissingRunId = runId;
      }

      document.missingSince ??= new Date();

      document.status =
        Number(document.missingConfirmationCount) >= 2
          ? "REMOVED"
          : "MISSING_PENDING_VERIFICATION";
      document.lastCrawledAt = new Date();
      await document.save({ session });
    });
  } finally {
    await session.endSession();
  }
};

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export {
  markKnowledgeDocumentMissing,
  markKnowledgeDocumentsVerificationAttempted,
  persistExtractedPage,
};
