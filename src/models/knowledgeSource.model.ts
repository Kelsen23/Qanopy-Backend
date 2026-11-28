import mongoose, { Schema } from "mongoose";

const KnowledgeSourceSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    publisher: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      enum: ["OFFICIAL_DOCS", "THIRD_PARTY"],
      required: true,
    },
    rootUrls: { type: [String], required: true, default: [] },
    allowedHosts: { type: [String], required: true, default: [] },
    allowedPathPrefixes: { type: [String], default: [] },
    excludedPathPrefixes: { type: [String], default: [] },
    enabled: { type: Boolean, required: true, default: false },
    crawl: {
      cadenceHours: { type: Number, required: true, min: 1, default: 168 },
      maxPages: { type: Number, required: true, min: 1 },
      maxDepth: { type: Number, required: true, min: 0 },
      maxConcurrency: { type: Number, required: true, min: 1 },
      maxDurationSeconds: { type: Number, required: true, min: 1 },
      userAgent: { type: String, required: true },
      respectRobotsTxt: { type: Boolean, required: true, default: true },
    },
    extraction: {
      adapter: { type: String, required: true },
      config: { type: Schema.Types.Mixed, default: {} },
    },
    technology: { type: String, trim: true },
    versions: { type: [String], default: [] },
    lastCrawl: {
      startedAt: Date,
      completedAt: Date,
      status: {
        type: String,
        enum: ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"],
      },
      error: String,
      pagesDiscovered: { type: Number, min: 0 },
      pagesChanged: { type: Number, min: 0 },
      pagesFailed: { type: Number, min: 0 },
    },
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

KnowledgeSourceSchema.index({ key: 1 }, { unique: true });
KnowledgeSourceSchema.index({ enabled: 1 });

export default mongoose.model(
  "KnowledgeSource",
  KnowledgeSourceSchema,
  "knowledge_sources",
);
