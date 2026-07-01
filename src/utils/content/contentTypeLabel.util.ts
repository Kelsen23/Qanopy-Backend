const contentTypeLabelMap = {
  QUESTION: "Question",
  ANSWER: "Answer",
  REPLY: "Reply",
  AI_ANSWER_FEEDBACK: "AI answer feedback",
} as const;

type ContentTypeLabelKey = keyof typeof contentTypeLabelMap;

const getContentTypeLabel = (contentType: string) =>
  contentTypeLabelMap[contentType as ContentTypeLabelKey] ?? contentType;

export { getContentTypeLabel };
