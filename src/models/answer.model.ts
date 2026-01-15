import mongoose, { Schema } from "mongoose";

const AnswerSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    userId: { type: String, required: true },

    body: { type: String, minlength: 20, maxlength: 20000, required: true },

    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
    isAccepted: { type: Boolean, default: false },
    isBestAnswerByAsker: { type: Boolean, default: false },

    questionVersion: { type: Number, required: true },

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

export default mongoose.model("Answer", AnswerSchema);
