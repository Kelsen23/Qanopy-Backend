import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";

import { routePendingModerationContent } from "./moderationRouter.shared.js";

const aiAnswerFeedbackRouter = async (
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

export default aiAnswerFeedbackRouter;
