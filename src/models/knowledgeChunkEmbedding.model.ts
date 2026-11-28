import mongoose, { Schema } from "mongoose";

const KnowledgeChunkEmbeddingSchema = new Schema(
  {
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeChunk",
      required: true,
    },
    model: { type: String, required: true },
    dimensions: { type: Number, required: true, min: 1 },
    representationVersion: { type: String, required: true },
    vector: { type: [Number], required: true },
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

KnowledgeChunkEmbeddingSchema.index(
  { chunkId: 1, model: 1, representationVersion: 1 },
  { unique: true },
);
KnowledgeChunkEmbeddingSchema.index({
  representationVersion: 1,
  model: 1,
  chunkId: 1,
});

export default mongoose.model(
  "KnowledgeChunkEmbedding",
  KnowledgeChunkEmbeddingSchema,
  "knowledge_chunk_embeddings",
);
