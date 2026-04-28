import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema(
  {
    userId: { type: String, required: true },
    targetType: {
      type: String,
      enum: ["QUESTION", "ANSWER", "REPLY"],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    voteType: { type: String, enum: ["UPVOTE", "DOWNVOTE"], required: true },
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
