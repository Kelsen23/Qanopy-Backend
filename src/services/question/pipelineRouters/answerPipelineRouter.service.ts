import { makeJobId } from "../../../utils/makeJobId.util.js";

import Answer from "../../../models/answer.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const answerPipelineRouter = async (answerId: string) => {
  const foundAnswer = await Answer.findById(answerId).select(
    "_id moderationStatus",
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
};

export default answerPipelineRouter;
