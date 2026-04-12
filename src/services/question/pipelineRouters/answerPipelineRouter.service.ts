import { makeJobId } from "../../../utils/makeJobId.util.js";

import Answer from "../../../models/answer.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";
import { clearAnswerCache } from "../../../utils/clearCache.util.js";

const answerPipelineRouter = async (answerId: string) => {
  const foundAnswer = await Answer.findById(answerId).select(
    "_id questionId moderationStatus",
  );

  if (!foundAnswer || foundAnswer.moderationStatus !== "PENDING") return;

  await contentModerationQueue.add(
    "ANSWER",
    { contentId: foundAnswer._id },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentModeration", "ANSWER", foundAnswer._id),
    },
  );

  await clearAnswerCache(foundAnswer.questionId as string);
};

export default answerPipelineRouter;
