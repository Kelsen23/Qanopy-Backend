import Reply from "../../../models/reply.model.js";

import { routePendingModerationContent } from "./moderationPipelineRouter.shared.js";

const replyPipelineRouter = async (
  replyId: string,
  moderationRevision?: number,
) => {
  await routePendingModerationContent({
    contentType: "REPLY",
    contentId: replyId,
    moderationRevision,
    model: Reply,
    select: "_id moderationStatus moderationRevision",
  });
};

export default replyPipelineRouter;
