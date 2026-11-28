import mongoose, { Schema } from "mongoose";

const KnowledgeDocumentSchema = new Schema(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeSource",
      required: true,
    },
    canonicalUrl: { type: String, required: true },
    urlHash: { type: String, required: true },
    title: { type: String, required: true },
    publisher: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["OFFICIAL_DOCS", "THIRD_PARTY"],
      required: true,
    },
    technology: String,
    versions: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED", "MISSING_PENDING_VERIFICATION", "REMOVED"],
      required: true,
      default: "DISABLED",
    },
    activeRevisionId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocumentRevision",
      default: null,
    },
    desiredRevisionId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocumentRevision",
      default: null,
    },
    lastSeenAt: Date,
    lastCrawledAt: Date,
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

KnowledgeDocumentSchema.index({ sourceId: 1, urlHash: 1 }, { unique: true });
KnowledgeDocumentSchema.index({ sourceId: 1, status: 1 });
KnowledgeDocumentSchema.index({ activeRevisionId: 1 });

export default mongoose.model(
  "KnowledgeDocument",
  KnowledgeDocumentSchema,
  "knowledge_documents",
);
