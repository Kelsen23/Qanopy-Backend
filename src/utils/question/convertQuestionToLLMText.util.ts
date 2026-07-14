const convertQuestionToLLMText = (
  title: string,
  body: string,
  tags: string[],
) => {
  const tagsBlock = tags.length ? `Tags: ${tags.join(", ")}` : "";

  return `
  Title: ${title}
  ${tagsBlock}
  
  Body:
  ${body}
  `.trim();
};

export default convertQuestionToLLMText;
