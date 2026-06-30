import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Answer from "../../../models/answer.model.js";

import { clearAnswerCache } from "../../../utils/cache/clearCache.util.js";
import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const answerPipelineRouter = async (answerId: string) => {
  const foundAnswer = await Answer.findById(answerId).select(
    "_id questionId moderationStatus moderationRevision",
  );

  if (!foundAnswer || foundAnswer.moderationStatus !== "PENDING") return;

  await contentModerationQueue.add(
    "ANSWER",
    {
      contentId: foundAnswer._id,
      moderationRevision: foundAnswer.moderationRevision,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentModeration", "ANSWER", foundAnswer._id),
    },
  );

  await clearAnswerCache(foundAnswer.questionId as string);
};

export default answerPipelineRouter;
