import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Reply from "../../../models/reply.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const replyPipelineRouter = async (
  replyId: string,
  moderationRevision?: number,
) => {
  const foundReply = await Reply.findById(replyId).select(
    "_id moderationStatus moderationRevision",
  );

  if (
    !foundReply ||
    foundReply.moderationStatus !== "PENDING" ||
    (moderationRevision !== undefined &&
      foundReply.moderationRevision !== moderationRevision)
  )
    return;

  await contentModerationQueue.add(
    "REPLY",
    {
      contentId: foundReply._id,
      moderationRevision: foundReply.moderationRevision,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "contentModeration",
        "REPLY",
        foundReply._id,
        foundReply.moderationRevision,
      ),
    },
  );
};

export default replyPipelineRouter;
