import { makeJobId } from "../../../utils/makeJobId.util.js";

import Reply from "../../../models/reply.model.js";

import contentModerationQueue from "../../../queues/contentModeration.queue.js";

const replyPipelineRouter = async (replyId: string) => {
  const foundReply = await Reply.findById(replyId).select(
    "_id moderationStatus",
  );

  if (!foundReply || foundReply.moderationStatus !== "PENDING") return;

  await contentModerationQueue.add(
    "REPLY",
    { contentId: foundReply._id },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("contentModeration", "REPLY", foundReply._id),
    },
  );
};

export default replyPipelineRouter;
