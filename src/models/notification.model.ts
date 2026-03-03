import mongoose, { Schema } from "mongoose";

const NotificationSchema: Schema = new Schema(
  {
    userId: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "WARN",
        "STRIKE",
        "REPORT_UPDATE",
        "REMOVE_CONTENT",
        "UPVOTE",
        "ANSWER",
        "MENTION",
        "REPLY",
      ],
      required: true,
    },

    referenceId: { type: String, required: true },

    seen: { type: Boolean, default: false },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
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

export default NotificationSchema;
