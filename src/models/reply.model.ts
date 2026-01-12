import mongoose, { Schema } from "mongoose";

const ReplySchema: Schema = new Schema(
  {
    answerId: { type: Schema.Types.ObjectId, ref: "Answer", required: true },
    userId: { type: String, required: true },

    body: { type: String, minlength: 1, maxlength: 150, required: true },

    upvoteCount: { type: Number, default: 0 },
    downvoteCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKeys: false,
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

export default mongoose.model("Reply", ReplySchema);
