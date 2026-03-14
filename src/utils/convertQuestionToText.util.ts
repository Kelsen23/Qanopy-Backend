const convertQuestionToText = (
  title: string,
  body: string,
  tags?: string[],
) => {
  return `Title: ${title}\nBody: ${body.slice(0, 300)}\nTags: ${tags ? `${tags.slice(0, 10).join(", ")}` : ""}`;
};

export default convertQuestionToText;
