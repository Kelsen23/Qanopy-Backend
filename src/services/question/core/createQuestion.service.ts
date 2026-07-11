import { queueQuestionContentFinalize } from "../../../utils/question/contentFinalize.util.js";

import Question from "../../../models/question.model.js";

import { queueQuestionStats } from "../question.shared.js";
import { toPublicQuestion } from "../question.response.js";

const createQuestion = async ({
  userId,
  title,
  body,
  tags,
}: {
  userId: string;
  title: string;
  body: string;
  tags: string[];
}) => {
  const newQuestion = await Question.create({
    userId,
    title,
    body,
    tags,
  });

  await queueQuestionStats({
    name: "ASK_QUESTION",
    action: "ASK_QUESTION",
    userId,
    jobIdParts: ["askQuestion", String(newQuestion._id)],
  });

  const moderationUpdatedAt =
    newQuestion.moderationUpdatedAt instanceof Date
      ? newQuestion.moderationUpdatedAt
      : null;

  await queueQuestionContentFinalize({
    userId,
    entityId: String(newQuestion._id),
    version: 1,
    basedOnVersion: 1,
    title,
    body,
    tags,
    moderationStatus: String(newQuestion.moderationStatus),
    moderationUpdatedAt,
    topicStatus: String(newQuestion.topicStatus),
    embeddingStatus: String(newQuestion.embeddingStatus),
  });

  return {
    message: "Successfully created question",
    question: toPublicQuestion(newQuestion),
  };
};

export default createQuestion;
