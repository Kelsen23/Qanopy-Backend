import prisma from "../../../config/prisma.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../utils/cache/clearCache.util.js";

import applyContentModerationDecisionService from "../applyContentModerationDecision.service.js";
import {
  moderationContentTypeMap,
  type ModeratableContentType,
  type ModerationDecision,
} from "./contentModeration.shared.js";
import routeNotification from "../../notification/routeNotification.service.js";
import sendBanNoticeEmail from "../sendBanNoticeEmail.service.js";

import moderationAuditQueue from "../../../queues/moderationAudit.queue.js";
import moderationMetricsQueue from "../../../queues/moderationMetrics.queue.js";

import type { LoadedModerationContent } from "./loadModerationContent.service.js";

type HandleContentModerationBanInput = {
  contentId: string;
  contentType: ModeratableContentType;
  versionOrRevision?: number;
  finalDecision: Exclude<ModerationDecision, "IGNORE" | "WARN">;
  aiConfidence: number;
  aiReasons: string[];
  severity: number;
  riskScore: number;
  baseMeta: Record<string, unknown>;
  decisionId: string;
  content: LoadedModerationContent["content"];
};

const handleContentModerationBan = async ({
  contentId,
  contentType,
  versionOrRevision,
  finalDecision,
  aiConfidence,
  aiReasons,
  severity,
  riskScore,
  baseMeta,
  decisionId,
  content,
}: HandleContentModerationBanInput) => {
  const existingStrike = await prisma.moderationStrike.findFirst({
    where: {
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion:
        contentType === "QUESTION" ? versionOrRevision : null,
      strikedBy: "AI_MODERATION",
    },
    select: { id: true },
  });

  let strikeCreatedThisAttempt = false;

  if (!existingStrike) {
    await prisma.moderationStrike.create({
      data: {
        userId: content.userId as string,
        aiDecision: finalDecision,
        aiConfidence,
        aiReasons,
        severity,
        riskScore,
        targetContentId: contentId,
        targetType: moderationContentTypeMap[contentType],
        targetContentVersion:
          contentType === "QUESTION" ? versionOrRevision : undefined,
        strikedBy: "AI_MODERATION",
      },
    });

    strikeCreatedThisAttempt = true;
  }

  const targetStillPending = await applyContentModerationDecisionService(
    contentId,
    contentType,
    "REJECTED",
    versionOrRevision,
  );

  if (!targetStillPending.applied) {
    if (strikeCreatedThisAttempt) {
      await prisma.moderationStrike.deleteMany({
        where: {
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion:
            contentType === "QUESTION" ? versionOrRevision : null,
          strikedBy: "AI_MODERATION",
        },
      });
      return;
    }
  }

  const newStrike = existingStrike
    ? existingStrike
    : await prisma.moderationStrike.findFirstOrThrow({
        where: {
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion:
            contentType === "QUESTION" ? versionOrRevision : null,
          strikedBy: "AI_MODERATION",
        },
      });

  await clearStrikesCache();

  await moderationMetricsQueue.add(
    finalDecision,
    { userId: content.userId as string },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", decisionId, finalDecision),
    },
  );

  const meta = {
    ...baseMeta,
    strikeId: newStrike.id,
    action: finalDecision,
  };

  await moderationAuditQueue.add(
    "MOD_ACTION_LOG",
    {
      decisionId,
      targetType: "USER",
      targetId: content.userId,
      targetUserId: content.userId,
      actorType: "AI_MODERATION",
      actionTaken: finalDecision,
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationAudit", decisionId, finalDecision),
    },
  );

  await routeNotification({
    recipientId: content.userId as string,
    actorId: "AI_MODERATION",
    event: "STRIKE",
    target: {
      entityType: "USER",
      entityId: content.userId as string,
    },
    meta,
  });

  await sendBanNoticeEmail({
    userId: content.userId as string,
    decisionId,
    actionTaken: finalDecision,
    reasons: aiReasons,
  });
};

export default handleContentModerationBan;
