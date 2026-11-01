import mongoose from "mongoose";

import { queueQuestionContentFinalize } from "../contentFinalize/contentFinalizeQueue.service.js";
import { queueQuestionStats } from "../question.shared.js";
import { createQuestionProcessingState } from "../processingState/questionProcessingState.service.js";
import { toPublicQuestion } from "../question.response.js";

import Question from "../../../models/question.model.js";
import QuestionSettings from "../../../models/questionSettings.model.js";

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
  const session = await mongoose.startSession();
  let newQuestion: any;
  let processingState: any;

  try {
    await session.withTransaction(async () => {
      [newQuestion] = await Question.create([{ userId, title, body, tags }], {
        session,
      });
      processingState = await createQuestionProcessingState(
        newQuestion._id,
        1,
        session,
      );
      await QuestionSettings.create([{ questionId: newQuestion._id }], {
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!newQuestion || !processingState) {
    throw new Error(
      "Question creation transaction did not create processing state",
    );
  }

  const moderationUpdatedAt =
    processingState.moderationUpdatedAt instanceof Date
      ? processingState.moderationUpdatedAt
      : null;

  await Promise.all([
    queueQuestionStats({
      name: "ASK_QUESTION",
      action: "ASK_QUESTION",
      userId,
      jobIdParts: ["askQuestion", String(newQuestion._id)],
    }),
    queueQuestionContentFinalize({
      userId,
      entityId: String(newQuestion._id),
      version: 1,
      basedOnVersion: 1,
      title,
      body,
      tags,
      moderationStatus: String(processingState.moderationStatus),
      moderationUpdatedAt,
    }),
  ]);

  return {
    message: "Successfully created question",
    question: toPublicQuestion(newQuestion, processingState),
  };
};

export default createQuestion;
