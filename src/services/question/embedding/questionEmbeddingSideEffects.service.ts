import { queueAiAnswerUnlockedNotification } from "../ai/unlockNotification.service.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

const runQuestionEmbeddingReadySideEffects = async ({
  questionId,
  version,
  userId,
}: {
  questionId: string;
  version: number;
  userId: string;
}) => {
  await queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version,
  });

  await queueAiAnswerUnlockedNotification({
    questionId,
    version,
    userId,
  });

  await getRedisCacheClient().del(`question:${questionId}`);
};

export default runQuestionEmbeddingReadySideEffects;
