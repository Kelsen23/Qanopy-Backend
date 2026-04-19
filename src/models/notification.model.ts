import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema(
  {
    recipientId: { type: String, required: true, index: true },

    actorId: { type: String, default: null },

    event: {
      type: String,
      enum: [
        "UPVOTE",
        "DOWNVOTE",
        "ANSWER_CREATED",
        "REPLY_CREATED",

        "AI_SUGGESTION_UNLOCKED",
        "AI_ANSWER_UNLOCKED",

        "SIMILAR_QUESTIONS_READY",
        "AI_SUGGESTION_READY",
        "AI_ANSWER_READY",

        "WARN",
        "STRIKE",
        "REPORT_UPDATE",
        "REMOVE_CONTENT",
      ],
      required: true,
      index: true,
    },

    target: {
      entityType: {
        type: String,
        enum: ["QUESTION", "ANSWER", "REPLY"],
        required: true,
      },
      entityId: { type: String, required: true },
      parentId: { type: String },
      questionVersion: { type: Number },
    },

    seen: { type: Boolean, default: false },
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

export default mongoose.model("Notification", NotificationSchema);
