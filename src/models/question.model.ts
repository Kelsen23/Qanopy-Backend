import mongoose, { Schema } from "mongoose";

const QuestionSchema: Schema = new Schema(
  {
    userId: { type: String, required: true },

    title: { type: String, minlength: 10, maxlength: 150, required: true },
    body: { type: String, minlength: 20, maxlength: 20000, required: true },
    tags: { type: [String], default: [] },

    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },
    answerCount: { type: Number, default: 0, min: 0 },
    acceptedAnswerCount: { type: Number, default: 0, min: 0 },

    currentVersion: { type: Number, default: 1, min: 1 },
    basedOnVersion: { type: Number, default: 1, min: 1 },
    lastRollbackVersion: { type: Number, default: null, required: false },

    similarQuestionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Question",
      default: [],
      index: true,
    },
    similarQuestionsStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSING", "READY"],
      default: "NONE",
    },

    embedding: { type: [Number], default: null, required: false },
    embeddingHash: { type: String, default: null, required: false },
    embeddingStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSING", "READY"],
      default: "NONE",
    },

    questionEligibilityStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "ALLOWED", "CLARIFY", "REJECTED"],
      default: "PENDING",
      index: true,
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
      index: true,
    },
    securityVerifierUpdatedAt: { type: Date, default: null },
    securityVerifierSourceVersion: { type: Number, default: 1, min: 1 },

    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "FLAGGED", "REJECTED"],
      default: "PENDING",
    },
    moderationUpdatedAt: { type: Date, default: null },
    moderationSourceVersion: { type: Number, default: 1, min: 1 },

    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
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

export default mongoose.model("Question", QuestionSchema);
