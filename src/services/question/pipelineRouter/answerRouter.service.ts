import { clearAnswerCache } from "../../../utils/cache/clearCache.util.js";

import Answer from "../../../models/answer.model.js";

import { routePendingModerationContent } from "./moderationRouter.shared.js";

const answerRouter = async (answerId: string, moderationRevision?: number) => {
  const foundAnswer = await routePendingModerationContent({
    contentType: "ANSWER",
    contentId: answerId,
    moderationRevision,
    model: Answer,
    select: "_id questionId moderationStatus moderationRevision",
  });

  if (!foundAnswer) return;

  await clearAnswerCache(foundAnswer.questionId as string);
};

export default answerRouter;
