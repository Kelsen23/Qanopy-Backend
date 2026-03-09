const convertQuestionToText = (title: string, body: string) => {
  return `Title: ${title}\nBody: ${body.slice(0, 300)}`;
};

export default convertQuestionToText;
