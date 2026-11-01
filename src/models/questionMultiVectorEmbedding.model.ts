import mongoose, { Schema } from "mongoose";

const QuestionMultiVectorEmbeddingSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    version: { type: Number, required: true, min: 1 },

    vectors: { type: [[Number]], required: true },

    model: { type: String, required: true },
    dimensions: { type: Number, required: true, min: 1 },
    tokenCount: { type: Number, required: true, min: 0 },
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

QuestionMultiVectorEmbeddingSchema.index(
  { questionId: 1, version: 1, model: 1, representationVersion: 1 },
  { unique: true },
);
QuestionMultiVectorEmbeddingSchema.index({
  representationVersion: 1,
  model: 1,
  questionId: 1,
  version: 1,
});

export default mongoose.model(
  "QuestionMultiVectorEmbedding",
  QuestionMultiVectorEmbeddingSchema,
  "question_multi_vector_embeddings",
);
