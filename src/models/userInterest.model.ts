import mongoose, { Schema } from "mongoose";

const UserInterestSchema = new Schema(
  {
    userId: { type: String, required: true },
    interests: [
      {
        tag: { type: String, required: true },
        score: { type: Number, default: 0, min: 0 },
      },
    ],
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

UserInterestSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model("UserInterest", UserInterestSchema, "user_interests");
