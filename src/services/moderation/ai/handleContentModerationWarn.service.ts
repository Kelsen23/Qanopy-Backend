import type { LoadedModerationContent } from "./loadModerationContent.service.js";
import { type ModeratableContentType } from "./contentModeration.shared.js";

import applyContentModerationDecisionService from "../applyContentModerationDecision.service.js";
import routeNotification from "../../notification/routeNotification.service.js";
import { queueContentPipelineRoute } from "../../question/pipelineRouter/pipelineRouting.service.js";

import prisma from "../../../config/prisma.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";
import buildAiModerationNotificationMeta from "../../../utils/moderation/aiModerationNotificationMeta.util.js";

import moderationMetricsQueue from "../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../queues/moderationAudit.queue.js";

type HandleContentModerationWarnInput = {
  contentId: string;
  contentType: ModeratableContentType;
  versionOrRevision?: number;
  aiReasons: string[];
  severity: number;
  baseMeta: Record<string, unknown>;
  decisionId: string;
  content: LoadedModerationContent["content"];
};

const handleContentModerationWarn = async ({
  contentId,
  contentType,
  versionOrRevision,
  aiReasons,
  severity,
  baseMeta,
  decisionId,
  content,
}: HandleContentModerationWarnInput) => {
  const moderationApplyResult = await applyContentModerationDecisionService(
    contentId,
    contentType,
    "FLAGGED",
    versionOrRevision,
  );

  if (!moderationApplyResult.applied) {
    return;
  }

  const title =
    aiReasons.length > 0 ? `${aiReasons[0]}` : "Community Guideline Warning";
  const warningExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const newWarning = await prisma.warning.create({
    data: {
      userId: content.userId as string,
      title,
      reasons: aiReasons,
      severity,
      warnedBy: "AI_MODERATION",
      expiresAt: warningExpiresAt,
    },
  });

  const meta = {
    ...baseMeta,
    warningId: newWarning.id,
    action: "WARN",
    expiresAt: warningExpiresAt,
  };
  const notificationMeta = buildAiModerationNotificationMeta({
    action: "WARN",
    reasons: aiReasons,
    expiresAt: warningExpiresAt,
  });

  await moderationAuditQueue.add(
    "MOD_ACTION_LOG",
    {
      decisionId,
      targetType: "USER",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: "WARN",
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationAudit", decisionId, "WARN"),
    },
  );

  await moderationMetricsQueue.add(
    "WARN",
    {
      userId: content.userId as string,
      reviewedBy: "AI_MODERATION",
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", decisionId, "WARN"),
    },
  );

  if (contentType === "QUESTION")
    await queueContentPipelineRoute({
      contentType: "QUESTION",
      contentId,
      version: versionOrRevision as number,
    });

  await routeNotification({
    recipientId: content.userId as string,
    event: "WARN",
    target: {
      entityType: "USER",
      entityId: content.userId as string,
    },
    meta: notificationMeta,
  });
};

export default handleContentModerationWarn;
