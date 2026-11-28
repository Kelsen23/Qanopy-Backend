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
    discovery: {
      sitemapUrls: { type: [String], default: [] },
      includeUrlPatterns: { type: [String], default: [] },
      excludeUrlPatterns: { type: [String], default: [] },
    },
    approval: {
      basis: {
        type: String,
        enum: [
          "OPEN_LICENSE",
          "DIRECT_PERMISSION",
          "TERMS_PERMIT",
          "OWNED_SOURCE",
          "OTHER",
        ],
      },
      evidenceReference: String,
      reviewedAt: Date,
    },
    enabled: { type: Boolean, required: true, default: false },
    crawl: {
      cadenceHours: { type: Number, required: true, min: 1, default: 168 },
      maxPages: { type: Number, required: true, min: 2 },
      maxDepth: { type: Number, required: true, min: 0 },
      maxConcurrency: { type: Number, required: true, min: 1 },
      maxRequestsPerMinute: {
        type: Number,
        required: true,
        min: 1,
        default: 30,
      },
      maxDurationSeconds: { type: Number, required: true, min: 1 },
      maxResponseBytes: {
        type: Number,
        required: true,
        min: 1024,
        default: 5 * 1024 * 1024,
      },
      userAgent: { type: String, required: true },
    },
    extraction: {
      contentSelectors: {
        type: [String],
        default: ["main", "article", '[role="main"]'],
      },
      removeSelectors: {
        type: [String],
        default: [
          "script",
          "style",
          "nav",
          "footer",
          "aside",
          '[role="navigation"]',
          ".sidebar",
          ".toc",
        ],
      },
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
      runId: String,
      error: String,
      pagesDiscovered: { type: Number, min: 0 },
      pagesFetched: { type: Number, min: 0 },
      pagesExtracted: { type: Number, min: 0 },
      pagesChanged: { type: Number, min: 0 },
      pagesFailed: { type: Number, min: 0 },
      durationMs: { type: Number, min: 0 },
    },
    crawlExecution: {
      leaseToken: String,
      leaseExpiresAt: Date,
      pendingRunRequestedAt: Date,
      fenceVersion: { type: Number, required: true, default: 0 },
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

KnowledgeSourceSchema.pre("validate", function validateEnabledSource() {
  if (!this.enabled) {
    return;
  }

  if (
    !this.approval?.basis ||
    !this.approval.evidenceReference?.trim() ||
    !this.approval.reviewedAt
  ) {
    this.invalidate(
      "approval",
      "Enabled Knowledge Sources require approval evidence and a review timestamp",
    );
  }
});

KnowledgeSourceSchema.index({ key: 1 }, { unique: true });
KnowledgeSourceSchema.index({ enabled: 1 });

export default mongoose.model(
  "KnowledgeSource",
  KnowledgeSourceSchema,
  "knowledge_sources",
);
