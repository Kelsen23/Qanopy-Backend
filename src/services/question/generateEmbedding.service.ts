import embeddingClient from "../../config/voyage.config.js";

const generateEmbedding = async (text: string) => {
  const res = await embeddingClient.embed({
    input: text,
    model: "voyage-4-lite",
    inputType: "query",
  });

  if (!res.data || !res.data[0] || !res.data[0].embedding) {
    throw new Error(
      "Failed to generate embedding: no data returned from Voyage",
    );
  }

  const vector: number[] = res.data[0].embedding;

  return vector;
};

export default generateEmbedding;
