import mongoose, { Schema } from "mongoose";

const QuestionEmbeddingSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    version: { type: Number, required: true, min: 1 },

    vector: { type: [Number], required: true },

    model: { type: String, required: true },
    dimensions: { type: Number, required: true, min: 1 },
    representationVersion: { type: String, required: true },
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

QuestionEmbeddingSchema.index(
  { questionId: 1, version: 1, model: 1, representationVersion: 1 },
  { unique: true },
);
QuestionEmbeddingSchema.index({ questionId: 1, version: 1 });
QuestionEmbeddingSchema.index({
  representationVersion: 1,
  model: 1,
  questionId: 1,
  version: 1,
});

export default mongoose.model(
  "QuestionEmbedding",
  QuestionEmbeddingSchema,
  "question_embeddings",
);
