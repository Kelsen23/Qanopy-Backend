import mongoose, { Schema } from "mongoose";

const UserInterestSchema = new Schema(
  {
    userId: { type: String, required: true },
    interests: {
      type: [
        {
          tag: { type: String, required: true },
          score: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const { _id, ...document } = ret;

        return { ...document, id: _id };
      },
    },
  },
);

UserInterestSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model(
  "UserInterest",
  UserInterestSchema,
  "user_interests",
);
