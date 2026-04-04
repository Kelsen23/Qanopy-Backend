import mongoose, { Schema } from "mongoose";

const aiAnswerFeedbackSchema = new Schema(
  {
    aiAnswerId: {
      type: Schema.Types.ObjectId,
      ref: "AiAnswer",
      required: true,
    },

    userId: { type: String, required: true },

    type: {
      type: String,
      enum: ["HELPFUL", "NOT_HELPFUL", "FLAG"],
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

aiAnswerFeedbackSchema.index({ aiAnswerId: 1, createdAt: -1 });
aiAnswerFeedbackSchema.index(
  { aiAnswerId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, isDeleted: false },
  },
);

export default mongoose.model(
  "AiAnswerFeedback",
  aiAnswerFeedbackSchema,
  "ai_answer_feedbacks",
);
