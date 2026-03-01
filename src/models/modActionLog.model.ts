import mongoose, { Schema } from "mongoose";

const ModActionLogSchema: Schema = new Schema(
  {
    targetType: {
      type: String,
      enum: ["Report", "Strike"],
      required: true,
    },

    targetId: {
      type: String,
      required: true,
    },

    adminId: {
      type: String,
      required: true,
    },

    targetUserId: {
      type: String,
      required: true,
    },

    actionTaken: {
      type: String,
      enum: ["BAN_TEMP", "BAN_PERM", "WARN", "IGNORE"],
      required: true,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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

export default mongoose.model("ModActionLog", ModActionLogSchema);
