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

    similarQuestionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Question",
      default: [],
      index: true,
    },

    embedding: { type: [Number], default: [] },
    embeddingHash: { type: String, default: "" },
    embeddingStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSING", "READY"],
      default: "NONE",
    },

    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "FLAGGED", "REJECTED"],
      default: "PENDING",
    },
    moderationUpdatedAt: { type: Date, default: null },
    topicStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "VALID", "OFF_TOPIC"],
      default: "PENDING",
    },

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
