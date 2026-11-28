import mongoose, { Schema } from "mongoose";

const KnowledgeChunkSparseEmbeddingSchema = new Schema(
  {
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeChunk",
      required: true,
    },
    indices: { type: [Number], required: true },
    values: { type: [Number], required: true },
    model: { type: String, required: true },
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

KnowledgeChunkSparseEmbeddingSchema.index(
  { chunkId: 1, model: 1, representationVersion: 1 },
  { unique: true },
);
KnowledgeChunkSparseEmbeddingSchema.index({
  representationVersion: 1,
  model: 1,
  chunkId: 1,
});

export default mongoose.model(
  "KnowledgeChunkSparseEmbedding",
  KnowledgeChunkSparseEmbeddingSchema,
  "knowledge_chunk_sparse_embeddings",
);
