import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const aiAnswerFeedbackPipelineRouter = async (
  aiAnswerFeedbackId: string,
  moderationRevision?: number,
) => {
  const foundAiAnswerFeedback = await AiAnswerFeedback.findById(
    aiAnswerFeedbackId,
  ).select("_id moderationStatus moderationRevision");

  if (
    !foundAiAnswerFeedback ||
    foundAiAnswerFeedback.moderationStatus !== "PENDING" ||
    (moderationRevision !== undefined &&
      foundAiAnswerFeedback.moderationRevision !== moderationRevision)
  )
    return;

  await contentModerationQueue.add(
    "AI_ANSWER_FEEDBACK",
    {
      contentId: foundAiAnswerFeedback._id,
      moderationRevision: foundAiAnswerFeedback.moderationRevision,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "contentModeration",
        "AI_ANSWER_FEEDBACK",
        foundAiAnswerFeedback._id,
        foundAiAnswerFeedback.moderationRevision,
      ),
    },
  );
};

export default aiAnswerFeedbackPipelineRouter;
