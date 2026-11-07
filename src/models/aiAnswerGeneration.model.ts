import mongoose, { Schema } from "mongoose";

const AiAnswerGenerationSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      immutable: true,
    },
    questionVersion: { type: Number, required: true, min: 1, immutable: true },
    aiAnswerVersion: { type: Number, required: true, min: 1, immutable: true },
    generationReason: {
      type: String,
      enum: ["INITIAL_AUTO", "INITIAL_MANUAL", "FEEDBACK_REFINEMENT"],
      required: true,
      immutable: true,
    },
    planningStatus: {
      type: String,
      enum: ["NOT_STARTED", "PROCESSING", "COMPLETED", "FAILED"],
      default: "NOT_STARTED",
      required: true,
    },
    generationPlanId: {
      type: Schema.Types.ObjectId,
      ref: "AiAnswerGenerationPlan",
    },
    paymentStatus: {
      type: String,
      enum: [
        "NOT_STARTED",
        "PROCESSING",
        "AUTHORIZED",
        "BLOCKED_INSUFFICIENT_TOKENS",
        "FAILED",
      ],
      default: "NOT_STARTED",
      required: true,
    },
    paymentOperationId: { type: String },
    reservedAmount: { type: Number, min: 0 },
    pricingPolicyVersion: { type: String },
    status: { type: String, required: true, default: "IN_PROGRESS" },
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

AiAnswerGenerationSchema.index(
  { questionId: 1, questionVersion: 1, aiAnswerVersion: 1 },
  { unique: true },
);

export default mongoose.model(
  "AiAnswerGeneration",
  AiAnswerGenerationSchema,
  "ai_answer_generations",
);
