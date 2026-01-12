import mongoose, { Schema } from "mongoose";

const QuestionSchema: Schema = new Schema(
  {
    userId: { type: String, required: true },

    title: { type: String, minlength: 10, maxlength: 150, required: true },
    body: { type: String, minlength: 20, maxlength: 20000, required: true },
    tags: { type: [String], default: [] },

    upvoteCount: { type: Number, default: 0 },
    downvoteCount: { type: Number, default: 0 },
    answerCount: { type: Number, default: 0 },

    currentVersion: { type: Number, default: 1 },

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
        ret.upvotes = ret.upvoteCount;
        ret.downvotes = ret.downvoteCount;

        delete ret._id;
        delete ret.upvoteCount;
        delete ret.downvoteCount;

        return ret;
      },
    },
  },
);

export default mongoose.model("Question", QuestionSchema);
