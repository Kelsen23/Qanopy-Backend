import mongoose, { Schema } from "mongoose";

const AiAnswerFeedbackSchema = new Schema(
  {
    aiAnswerId: {
      type: Schema.Types.ObjectId,
      ref: "AiAnswer",
      required: true,
    },

    userId: { type: String, required: true },
    type: {
      type: String,
      enum: ["HELPFUL", "NOT_HELPFUL"],
      required: true,
    },
    body: { type: String, minlength: 1, maxlength: 150, default: null },
    questionVersionAtFeedback: { type: Number, min: 1, required: true },

    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "FLAGGED", "REJECTED"],
      default: "PENDING",
    },
    moderationUpdatedAt: { type: Date },
    moderationRevision: { type: Number, default: 1, min: 1 },

    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdAt: Date,
    updatedAt: Date,
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

AiAnswerFeedbackSchema.index({ aiAnswerId: 1, createdAt: -1 });

AiAnswerFeedbackSchema.index(
  { aiAnswerId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, isDeleted: false },
  },
);

export default mongoose.model(
  "AiAnswerFeedback",
  AiAnswerFeedbackSchema,
  "ai_answer_feedbacks",
);
