import mongoose, { Schema } from "mongoose";

const QuestionProcessingStateSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      immutable: true,
      unique: true,
    },
    questionVersion: { type: Number, required: true, default: 1, min: 1 },

    similarQuestionsStatus: {
      type: String,
      enum: ["NOT_STARTED", "PENDING", "PROCESSING", "READY"],
      default: "NOT_STARTED",
      required: true,
    },
    similarQuestionsComputedAt: { type: Date, default: null },
    similarQuestionsComputedVersion: { type: Number, default: null, min: 1 },

    embeddingStatus: {
      type: String,
      enum: ["NOT_STARTED", "PENDING", "PROCESSING", "READY"],
      default: "NOT_STARTED",
      required: true,
    },

    questionEligibilityStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "ALLOWED", "CLARIFY", "REJECTED"],
      default: "PENDING",
      required: true,
    },
    questionEligibilityUpdatedAt: { type: Date, default: null },
    questionEligibilitySourceVersion: { type: Number, default: 1, min: 1 },

    securityVerifierStatus: {
      type: String,
      enum: [
        "NOT_REQUIRED",
        "PENDING",
        "PROCESSING",
        "ALLOWED",
        "ALLOWED_WITH_CONSTRAINTS",
        "REJECTED",
      ],
      default: "NOT_REQUIRED",
      required: true,
    },
    securityVerifierUpdatedAt: { type: Date, default: null },
    securityVerifierSourceVersion: { type: Number, default: 1, min: 1 },

    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "FLAGGED", "REJECTED"],
      default: "PENDING",
      required: true,
    },
    moderationUpdatedAt: { type: Date, default: null },
    moderationSourceVersion: { type: Number, default: 1, min: 1 },

    canGetAISuggestion: { type: Boolean, default: false, required: true },
    canGetAIAnswer: { type: Boolean, default: false, required: true },
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

QuestionProcessingStateSchema.index({
  moderationStatus: 1,
  questionEligibilityStatus: 1,
  securityVerifierStatus: 1,
  questionId: 1,
});

QuestionProcessingStateSchema.index({
  moderationStatus: 1,
  questionEligibilityStatus: 1,
  securityVerifierStatus: 1,
  embeddingStatus: 1,
  similarQuestionsStatus: 1,
  similarQuestionsComputedAt: 1,
  questionId: 1,
});

export default mongoose.model(
  "QuestionProcessingState",
  QuestionProcessingStateSchema,
  "question_processing_states",
);

export { QuestionProcessingStateSchema };
