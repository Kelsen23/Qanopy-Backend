import mongoose, { Schema } from "mongoose";

const ReplySchema: Schema = new Schema(
  {
    answerId: { type: Schema.Types.ObjectId, ref: "Answer", required: true },
    userId: { type: String, required: true },

    body: { type: String, minlength: 1, maxlength: 150, required: true },

    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },

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

export default mongoose.model("Reply", ReplySchema);
