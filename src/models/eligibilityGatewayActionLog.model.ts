import mongoose, { Schema } from "mongoose";

const EligibilityActionLogSchema: Schema = new Schema(
  {
    decisionId: { type: String, required: true },

    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    targetUserId: { type: String, required: true },

    stage: {
      type: String,
      enum: ["QUESTION_ELIGIBILITY_GATE", "SECURITY_VERIFIER"],
      required: true,
    },
    decision: {
      type: String,
      enum: ["ALLOW", "CLARIFY", "REJECT", "ALLOW_WITH_CONSTRAINTS"],
      required: true,
    },

    provider: { type: String, required: true },
    model: { type: String, required: true },
    fallbackUsed: { type: Boolean, default: false },
    promptHash: { type: String, required: true },

    latencyMs: { type: Number, default: null },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    totalTokens: { type: Number, default: null },
    cacheReadTokens: { type: Number, default: null },
    cacheCreationTokens: { type: Number, default: null },
    providerReportedCost: { type: Number, default: null },
    estimatedCost: { type: Number, default: null },

    rawResult: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    validationErrors: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret: any) => {
        ret.id = ret._id;

        delete ret._id;

        return ret;
      },
    },
  },
);

EligibilityActionLogSchema.index({
  questionId: 1,
  version: 1,
  stage: 1,
  createdAt: -1,
});

EligibilityActionLogSchema.index({ decisionId: 1 });

export default mongoose.model(
  "EligibilityActionLog",
  EligibilityActionLogSchema,
  "eligibility_action_logs",
);
