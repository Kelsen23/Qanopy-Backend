import generateQuestionSuggestionService from "../ai/generateQuestionSuggestion.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

type ProcessAiSuggestionJobData = {
  userId: string;
  questionId: string;
  version: number;
};

const processQuestionAiSuggestionJob = async ({
  userId,
  questionId,
  version,
}: ProcessAiSuggestionJobData) => {
  try {
    await generateQuestionSuggestionService({ userId, questionId, version });
  } finally {
    await getRedisCacheClient().del(
      `aiSuggestion:pending:${userId}:${questionId}:${version}`,
    );
  }
};

export default processQuestionAiSuggestionJob;
