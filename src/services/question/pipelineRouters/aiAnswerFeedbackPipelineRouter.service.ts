import { makeJobId } from "../../../utils/makeJobId.util.js";

import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const aiAnswerFeedbackPipelineRouter = async (aiAnswerFeedbackId: string) => {
  const foundAiAnswerFeedback = await AiAnswerFeedback.findById(
    aiAnswerFeedbackId,
  ).select("_id moderationStatus");

  if (
    !foundAiAnswerFeedback ||
    foundAiAnswerFeedback.moderationStatus !== "PENDING"
  )
    return;

  await contentModerationQueue.add(
    "AI_ANSWER_FEEDBACK",
    {
      contentId: foundAiAnswerFeedback._id,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "contentModeration",
        "AI_ANSWER_FEEDBACK",
        foundAiAnswerFeedback._id,
      ),
    },
  );
};

export default aiAnswerFeedbackPipelineRouter;
