import mongoose, { Schema } from "mongoose";

const AiAnswerGenerationPlanSchema = new Schema(
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
      enum: ["INITIAL_MANUAL", "INITIAL_AUTO", "FEEDBACK_REFINEMENT"],
      required: true,
      immutable: true,
    },
    generationPlan: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    plannerFallbackUsed: { type: Boolean, immutable: true },
    plannerMetadata: { type: Schema.Types.Mixed, immutable: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "ai_answer_generation_plans",
  },
);

AiAnswerGenerationPlanSchema.index(
  { questionId: 1, questionVersion: 1, aiAnswerVersion: 1 },
  { unique: true },
);

export default mongoose.model(
  "AiAnswerGenerationPlan",
  AiAnswerGenerationPlanSchema,
);
