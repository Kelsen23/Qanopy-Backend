import mongoose, { Schema } from "mongoose";

const KnowledgeDocumentRevisionSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocument",
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeSource",
      required: true,
    },
    revisionNumber: { type: Number, required: true, min: 1 },
    canonicalUrl: { type: String, required: true },
    title: { type: String, required: true },
    publisher: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["OFFICIAL_DOCS", "THIRD_PARTY"],
      required: true,
    },
    technology: String,
    versions: { type: [String], default: [] },
    retrievedAt: { type: Date, required: true },
    contentHash: { type: String, required: true },
    extractionVersion: { type: String, required: true },
    content: { type: [Schema.Types.Mixed], required: true, default: [] },
    plainText: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "INDEXING", "ACTIVE", "SUPERSEDED", "FAILED"],
      required: true,
      default: "PENDING",
    },
    indexingError: String,
    indexedAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const { _id, ...document } = ret;
        return { ...document, id: _id };
      },
    },
  },
);

KnowledgeDocumentRevisionSchema.index(
  { documentId: 1, contentHash: 1 },
  { unique: true },
);
KnowledgeDocumentRevisionSchema.index(
  { documentId: 1, revisionNumber: 1 },
  { unique: true },
);
KnowledgeDocumentRevisionSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model(
  "KnowledgeDocumentRevision",
  KnowledgeDocumentRevisionSchema,
  "knowledge_document_revisions",
);
