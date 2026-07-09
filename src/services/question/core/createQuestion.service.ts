import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";

import contentFinalizeQueue from "../../../queues/contentFinalize.queue.js";

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

  await contentFinalizeQueue.add(
    "QUESTION",
    {
      userId,
      entityId: String(newQuestion._id),
      version: 1,
      basedOnVersion: 1,
      title,
      body,
      tags,
      moderationStatus: newQuestion.moderationStatus,
      moderationUpdatedAt: newQuestion.moderationUpdatedAt,
      topicStatus: newQuestion.topicStatus,
      embeddingStatus: newQuestion.embeddingStatus,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentFinalize", "QUESTION", String(newQuestion._id)),
    },
  );

  return {
    message: "Successfully created question",
    question: toPublicQuestion(newQuestion),
  };
};

export default createQuestion;
