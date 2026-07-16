import type { LoadedModerationContent } from "./loadModerationContent.service.js";
import { type ModeratableContentType } from "./contentModeration.shared.js";

import applyContentModerationDecisionService from "../applyContentModerationDecision.service.js";
import { queueContentPipelineRoute } from "../../question/pipelineRouter/pipelineRouting.service.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import moderationMetricsQueue from "../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../queues/moderationAudit.queue.js";

type HandleContentModerationIgnoreInput = {
  contentId: string;
  contentType: ModeratableContentType;
  versionOrRevision?: number;
  baseMeta: Record<string, unknown>;
  decisionId: string;
  content: LoadedModerationContent["content"];
};

const handleContentModerationIgnore = async ({
  contentId,
  contentType,
  versionOrRevision,
  baseMeta,
  decisionId,
  content,
}: HandleContentModerationIgnoreInput) => {
  const moderationApplyResult = await applyContentModerationDecisionService(
    contentId,
    contentType,
    "APPROVED",
    versionOrRevision,
  );

  if (!moderationApplyResult.applied) {
    return;
  }

  const meta = {
    ...baseMeta,
    action: "IGNORE",
  };

  await moderationAuditQueue.add(
    "MOD_ACTION_LOG",
    {
      decisionId,
      targetType: "USER",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "IGNORE",
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationAudit", decisionId, "IGNORE"),
    },
  );

  if (contentType === "QUESTION")
    await queueContentPipelineRoute({
      contentType: "QUESTION",
      contentId,
      version: versionOrRevision as number,
    });

  await moderationMetricsQueue.add(
    "IGNORE",
    {
      userId: content.userId as string,
      reviewedBy: "AI_MODERATION",
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", decisionId, "IGNORE"),
    },
  );
};

export default handleContentModerationIgnore;
