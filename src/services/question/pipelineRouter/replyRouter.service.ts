import Reply from "../../../models/reply.model.js";

import { routePendingModerationContent } from "./moderationRouter.shared.js";

const replyRouter = async (
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

export default replyRouter;
