import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";

import { routePendingModerationContent } from "./moderationPipelineRouter.shared.js";

const aiAnswerFeedbackPipelineRouter = async (
  aiAnswerFeedbackId: string,
  moderationRevision?: number,
) => {
  await routePendingModerationContent({
    contentType: "AI_ANSWER_FEEDBACK",
    contentId: aiAnswerFeedbackId,
    moderationRevision,
    model: AiAnswerFeedback,
    select: "_id moderationStatus moderationRevision",
  });
};

export default aiAnswerFeedbackPipelineRouter;
