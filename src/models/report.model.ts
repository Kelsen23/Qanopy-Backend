import mongoose, { Schema } from "mongoose";

const ReportSchema: Schema = new Schema(
  {
    reportedBy: { type: String, required: true },
    targetUserId: { type: String, required: true },

    targetId: { type: String, required: true },
    targetType: {
      type: String,
      required: true,
      enum: ["QUESTION", "ANSWER", "REPLY", "AI_ANSWER_FEEDBACK"],
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
      enum: ["PENDING", "RESOLVED", "DISMISSED"],
      default: "PENDING",
    },

    reviewedBy: { type: String, default: null },

    claimedAt: { type: Date, default: null },
    claimExpiresAt: { type: Date, default: null, index: true },
    claimToken: { type: String, default: null, select: false },
    
    reviewComment: { type: String, maxlength: 150, minlength: 3 },
    actionTaken: {
      type: String,
      enum: ["PENDING", "BAN_TEMP", "BAN_PERM", "WARN", "IGNORE"],
      default: "PENDING",
    },
    isRemovingContent: { type: Boolean, required: true, default: false },
    
    reviewedAt: { type: Date, default: null },
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

ReportSchema.index({ reviewedBy: 1, claimExpiresAt: 1 });

export default mongoose.model("Report", ReportSchema);
