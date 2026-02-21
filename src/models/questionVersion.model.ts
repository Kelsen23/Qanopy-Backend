import mongoose, { Schema } from "mongoose";

const QuestionVersionSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },

    title: { type: String, minlength: 10, maxlength: 150, required: true },
    body: { type: String, minlength: 20, maxlength: 20000, required: true },
    tags: { type: [String], default: [] },

    editedBy: { type: String, enum: ["USER", "AI"], required: true },
    editorId: { type: String },

    supersededByRollback: { type: Boolean, default: false, required: true },
    version: { type: Number, required: true },
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
    },
    topicStatus: {
      type: String,
      enum: ["PENDING", "VALID", "OFF_TOPIC", "UNCERTAIN"],
      default: "PENDING",
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
