import mongoose, { Schema } from "mongoose";

const KnowledgeChunkSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocument",
      required: true,
    },
    revisionId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeDocumentRevision",
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeSource",
      required: true,
    },
    chunkIndex: { type: Number, required: true, min: 0 },
    chunkHash: { type: String, required: true },
    text: { type: String, required: true },
    headingPath: { type: [String], default: [] },
    contentType: {
      type: String,
      enum: ["PROSE", "CODE", "TABLE", "WARNING", "LIST", "OTHER"],
      required: true,
    },
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
    chunkerVersion: { type: String, required: true },
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

KnowledgeChunkSchema.index(
  { revisionId: 1, chunkerVersion: 1, chunkIndex: 1 },
  { unique: true },
);
KnowledgeChunkSchema.index({ sourceId: 1, documentId: 1, revisionId: 1 });

export default mongoose.model(
  "KnowledgeChunk",
  KnowledgeChunkSchema,
  "knowledge_chunks",
);
