const convertQuestionToText = (
  title: string,
  body: string,
  tags: string[],
  isSuggestion: boolean,
) => {
  const processedBody = isSuggestion ? body : body.slice(0, 300);

  return `Title: ${title}\nBody: ${processedBody}\nTags: ${tags.slice(0, 10).join(", ")}`;
};

export default convertQuestionToText;