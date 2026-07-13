import llmGateway from "../../llmGateway/llmGateway.service.js";

const generateEmbedding = async (text: string) => {
  const response = await llmGateway.embed({
    input: text,
    inputType: "query",
  });

  return response.embedding;
};

export default generateEmbedding;
