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

import moderationAuditQueue from "../../../queues/moderationAudit.queue.js";

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
  const targetStillPending = await applyContentModerationDecisionService(
    contentId,
    contentType,
    "REJECTED",
    versionOrRevision,
  );

  if (!targetStillPending.applied) {
    return;
  }

  const newStrike = await prisma.$transaction(async (tx) => {
    const createdStrike = await tx.moderationStrike.create({
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

    return createdStrike;
  });

  await clearStrikesCache();

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
};

export default handleContentModerationBan;
