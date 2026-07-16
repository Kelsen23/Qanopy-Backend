import mongoose from "mongoose";

import routeNotification from "../../notification/routeNotification.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

const runSimilarQuestionsReadySideEffects = async ({
  questionId,
  version,
  userId,
  similarQuestionIds,
}: {
  questionId: string;
  version: number;
  userId: string;
  similarQuestionIds: mongoose.Types.ObjectId[];
}) => {
  await getRedisCacheClient().del(
    `question:${questionId}`,
    `similarQuestions:${questionId}`,
  );

  await routeNotification({
    recipientId: userId,
    event: "SIMILAR_QUESTIONS_READY",
    target: {
      entityType: "QUESTION",
      entityId: questionId,
      questionVersion: version,
    },
    meta: {
      count: similarQuestionIds.length,
      previewIds: similarQuestionIds.slice(0, 3),
    },
  });
};

export default runSimilarQuestionsReadySideEffects;
