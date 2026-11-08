import mongoose, { Schema } from "mongoose";

const AiAnswerSchema = new Schema(
  {
    userId: { type: String, required: true, immutable: true },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    questionVersion: { type: Number, min: 1, required: true },
    aiAnswerVersion: { type: Number, min: 1, required: true, immutable: true },
    body: { type: String, minlength: 20, maxlength: 20000, required: true },

    confidence: {
      overall: { type: Number, min: 0, max: 100, required: true },
      note: { type: String },
      sections: [
        {
          sectionName: { type: String, required: true },
          confidence: { type: Number, min: 0, max: 100 },
          note: { type: String },
        },
      ],
    },

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isPublished: { type: Boolean, default: false },
    createdAt: Date,
    updatedAt: Date,
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

AiAnswerSchema.index(
  { questionId: 1, questionVersion: 1, aiAnswerVersion: 1 },
  { unique: true },
);

AiAnswerSchema.index(
  { questionId: 1, isPublished: 1 },
  { unique: true, partialFilterExpression: { isPublished: true } },
);

export default mongoose.model("AiAnswer", AiAnswerSchema, "ai_answers");
