import mongoose, { Schema } from "mongoose";

const QuestionSettingsSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      unique: true,
    },
    aiAnswerAutoGeneration: { type: Boolean, required: true, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const { _id, ...settings } = ret;

        return { ...settings, id: _id };
      },
    },
  },
);

export default mongoose.model(
  "QuestionSettings",
  QuestionSettingsSchema,
  "question_settings",
);
