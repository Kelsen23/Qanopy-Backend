const convertQuestionToEmbeddingText = (
  title: string,
  body: string,
  tags: string[],
) => {
  const processedBody = body.slice(0, 600);
  const tagText = tags.slice(0, 5).join(" ");
  const contextBlock = tagText ? `Context:\n${tagText}` : "";

  return `
  ${title}
  ${title}
  
  ${contextBlock}
  
  ${processedBody}
  `.trim();
};

export default convertQuestionToEmbeddingText;
