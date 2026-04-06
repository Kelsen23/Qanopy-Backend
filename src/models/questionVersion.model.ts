import mongoose, { Schema } from "mongoose";

const QuestionVersionSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    userId: { type: String, required: true },

    title: { type: String, minlength: 10, maxlength: 150, required: true },
    body: { type: String, minlength: 20, maxlength: 20000, required: true },
    tags: { type: [String], default: [] },

    supersededByRollback: { type: Boolean, default: false, required: true },
    version: { type: Number, required: true, min: 1 },
    basedOnVersion: { type: Number, required: true },
    isActive: { type: Boolean, required: true, index: true },

    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "FLAGGED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    moderationUpdatedAt: {
      type: Date,
      default: null,
    },
    topicStatus: {
      type: String,
      enum: ["PENDING", "VALID", "OFF_TOPIC"],
      default: "PENDING",
    },

    embedding: { type: [Number] },
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

QuestionVersionSchema.index(
  { questionId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

QuestionVersionSchema.index({ questionId: 1, _id: -1 });

export default mongoose.model(
  "QuestionVersion",
  QuestionVersionSchema,
  "question_versions",
);
