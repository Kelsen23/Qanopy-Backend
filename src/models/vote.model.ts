import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema(
  {
    userId: { type: String, required: true },
    targetType: {
      type: String,
      enum: ["Question", "Answer", "Reply"],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    voteType: { type: String, enum: ["upvote", "downvote"], required: true },
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

export default mongoose.model("Vote", VoteSchema);
