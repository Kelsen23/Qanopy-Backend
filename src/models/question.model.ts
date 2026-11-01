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

    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
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

export default mongoose.model("Question", QuestionSchema);
