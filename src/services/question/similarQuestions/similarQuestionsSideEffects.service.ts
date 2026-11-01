import routeNotification from "../../notification/routeNotification.service.js";
import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { clearQuestionDiscoveryCache } from "../../../utils/cache/clearCache.util.js";

const runSimilarQuestionsReadySideEffects = async ({
  questionId,
  version,
  userId,
  similarQuestionIds,
  notify = true,
}: {
  questionId: string;
  version: number;
  userId: string;
  similarQuestionIds: string[];
  notify?: boolean;
}) => {
  await queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version,
  });

  await getRedisCacheClient().del(
    `question:${questionId}`,
    `similarQuestions:${questionId}`,
  );
  await clearQuestionDiscoveryCache();

  if (notify)
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
