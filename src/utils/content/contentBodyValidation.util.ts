import { extractTempContentImageMatches } from "../media/contentImageMarkdown.util.js";

type ContentBodyType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

const minimumBodyLengthByType: Record<ContentBodyType, number> = {
  QUESTION: 20,
  ANSWER: 20,
  REPLY: 1,
  AI_ANSWER_FEEDBACK: 1,
};

const stripTempContentImageMarkdown = (body: string) => {
  const matches = extractTempContentImageMatches(body);
  const uniqueMarkdown = new Set(matches.map((match) => match.fullMarkdown));

  let nextBody = body;
  for (const markdown of uniqueMarkdown) {
    nextBody = nextBody.replaceAll(markdown, "");
  }

  return nextBody;
};

const hasMinimumBodyLengthAfterTempImageRemoval = (
  body: string,
  contentType: ContentBodyType,
) =>
  stripTempContentImageMarkdown(body).length >=
  minimumBodyLengthByType[contentType];

export type { ContentBodyType };

export {
  hasMinimumBodyLengthAfterTempImageRemoval,
  stripTempContentImageMarkdown,
};
