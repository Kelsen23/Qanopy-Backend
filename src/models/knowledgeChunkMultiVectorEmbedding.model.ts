import mongoose, { Schema } from "mongoose";

const KnowledgeChunkMultiVectorEmbeddingSchema = new Schema(
  {
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeChunk",
      required: true,
    },
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

KnowledgeChunkMultiVectorEmbeddingSchema.index(
  { chunkId: 1, model: 1, representationVersion: 1 },
  { unique: true },
);
KnowledgeChunkMultiVectorEmbeddingSchema.index({
  representationVersion: 1,
  model: 1,
  chunkId: 1,
});

export default mongoose.model(
  "KnowledgeChunkMultiVectorEmbedding",
  KnowledgeChunkMultiVectorEmbeddingSchema,
  "knowledge_chunk_multi_vector_embeddings",
);
