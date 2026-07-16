import crypto from "crypto";

import convertQuestionToEmbeddingText from "../../../utils/question/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../../../utils/question/normalizeText.util.js";

const buildQuestionEmbeddingInput = ({
  title,
  body,
  tags,
}: {
  title: string;
  body: string;
  tags: string[];
}) => {
  const text = convertQuestionToEmbeddingText(
    normalizeText(title),
    normalizeText(body),
    tags,
  );
  const hash = crypto.createHash("sha256").update(text).digest("hex");

  return { text, hash };
};

export default buildQuestionEmbeddingInput;
