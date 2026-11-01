import mongoose, { Schema } from "mongoose";

const SimilarQuestionSchema = new Schema(
  {
    sourceQuestionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    sourceVersion: { type: Number, required: true, min: 1 },

    targetQuestionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    targetVersion: { type: Number, required: true, min: 1 },

    rank: { type: Number, required: true, min: 1 },
    score: { type: Number, required: true },
    retrievalVersion: { type: String, required: true },
    model: { type: String, required: true },
    representationVersion: { type: String, required: true },
    computedAt: { type: Date, required: true, default: Date.now },
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

SimilarQuestionSchema.index({
  sourceQuestionId: 1,
  sourceVersion: 1,
  retrievalVersion: 1,
  rank: 1,
});

SimilarQuestionSchema.index({ targetQuestionId: 1, targetVersion: 1 });

SimilarQuestionSchema.index(
  {
    sourceQuestionId: 1,
    sourceVersion: 1,
    targetQuestionId: 1,
    targetVersion: 1,
    retrievalVersion: 1,
  },
  { unique: true },
);

export default mongoose.model(
  "SimilarQuestion",
  SimilarQuestionSchema,
  "similar_questions",
);
