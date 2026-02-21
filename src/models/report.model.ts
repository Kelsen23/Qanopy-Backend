import mongoose, { Schema } from "mongoose";

const ReportSchema: Schema = new Schema(
  {
    reportedBy: { type: String, required: true },

    targetUserId: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: {
      type: String,
      required: true,
      enum: ["Question", "Answer", "Reply"],
    },

    reportReason: {
      type: String,
      required: true,
      enum: [
        "SPAM",
        "HARASSMENT",
        "HATE_SPEECH",
        "INAPPROPRIATE_CONTENT",
        "MISINFORMATION",
        "OTHER",
      ],
    },
    reportComment: {
      type: String,
      maxlength: 150,
      minlength: 3,
      default: null,
    },

    status: {
      type: String,
      enum: ["PENDING", "REVIEWING", "RESOLVED", "DISMISSED"],
      default: "PENDING",
    },

    actionTaken: {
      type: String,
      enum: ["PENDING", "BAN_TEMP", "BAN_PERM", "WARN", "IGNORE"],
      default: "PENDING",
    },
    isRemovingContent: { type: Boolean, required: true, default: false },
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

export default mongoose.model("Report", ReportSchema);
