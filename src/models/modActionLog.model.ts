import mongoose, { Schema } from "mongoose";

const ModActionLogSchema: Schema = new Schema(
  {
    decisionId: { type: String, required: true },

    targetType: {
      type: String,
      enum: ["Content", "User", "Report", "Strike"],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    targetUserId: {
      type: String,
      required: true,
    },

    actorType: {
      type: String,
      enum: ["ADMIN_MODERATION", "AI_MODERATION"],
      required: true,
    },
    adminId: {
      type: String,
    },

    actionTaken: {
      type: String,
      enum: ["BAN_TEMP", "BAN_PERM", "WARN", "REMOVE", "IGNORE"],
      required: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    overriddenBy: { type: String },
    overriddenAt: { type: Date },
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

export default mongoose.model(
  "ModActionLog",
  ModActionLogSchema,
  "mod_action_logs",
);
