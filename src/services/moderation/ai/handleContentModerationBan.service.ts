import prisma from "../../../config/prisma.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../utils/cache/clearCache.util.js";
import clearUserCache from "../../../utils/cache/clearUserCache.util.js";
import clearModeratedContentCache from "../../../utils/moderation/clearModeratedContentCache.util.js";
import buildAiModerationNotificationMeta from "../../../utils/moderation/aiModerationNotificationMeta.util.js";

import applyContentModerationDecisionService from "../applyContentModerationDecision.service.js";
import applyUserBan from "../applyUserBan.service.js";
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
  tempBanDurationMs: number;
  baseMeta: Record<string, unknown>;
  decisionId: string;
  content: LoadedModerationContent["content"];
};

const AI_BAN_TITLE_BY_REASON: Record<string, string> = {
  "Your content appears to contain sexual material involving a minor or someone who may be underage.":
    "Sexual Content Involving Minors",
  "Your content appears to contain graphic depictions of serious injury, gore, or extreme violence.":
    "Graphic Violence",
  "Your content appears to contain graphic depictions of self-harm, injury, or suicide.":
    "Graphic Self-Harm Content",
  "Your content appears to provide instructions, methods, or guidance related to self-harm.":
    "Self-Harm Instructions",
  "Your content appears to contain hateful language combined with threats, intimidation, or calls for harm toward a protected group.":
    "Threatening Hate Speech",
  "Your content appears to contain targeted threats, intimidation, or severe harassment directed at another individual.":
    "Targeted Threats Or Harassment",
  "Your content appears to promote, encourage, glorify, or normalize self-harm.":
    "Promotion Of Self-Harm",
  "Your content appears to express an intention or desire to engage in self-harm.":
    "Self-Harm Intent",
  "Your content appears to contain hateful, degrading, or discriminatory language targeting people based on protected characteristics.":
    "Hateful Or Discriminatory Content",
  "Your content appears to contain insults, abusive language, or targeted harassment directed at another person.":
    "Harassment Or Abuse",
  "Your content appears to contain explicit sexual material or sexually descriptive content.":
    "Explicit Sexual Content",
  "Your content appears to contain depictions, descriptions, or promotion of violence.":
    "Violent Content",
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
  tempBanDurationMs,
  baseMeta,
  decisionId,
  content,
}: HandleContentModerationBanInput) => {
  const banTitle =
    (aiReasons[0] && AI_BAN_TITLE_BY_REASON[aiReasons[0]]) || "Temporary ban";
  const shouldCreateStrike = finalDecision === "BAN_PERM";
  const existingStrike = shouldCreateStrike
    ? await prisma.moderationStrike.findFirst({
        where: {
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: versionOrRevision,
          strikedBy: "AI_MODERATION",
        },
        select: { id: true },
      })
    : null;

  let strikeCreatedThisAttempt = false;

  if (shouldCreateStrike && !existingStrike) {
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
        targetContentVersion: versionOrRevision,
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
          targetContentVersion: versionOrRevision,
          strikedBy: "AI_MODERATION",
        },
      });

      return;
    }
  }

  let createdBan = false;

  if (content.userId && finalDecision === "BAN_TEMP") {
    await prisma.$transaction(async (tx) => {
      const result = await applyUserBan(tx, {
        userId: content.userId as string,
        banType: "TEMP",
        title: banTitle,
        reasons: aiReasons,
        bannedBy: "AI_MODERATION",
        durationMs: tempBanDurationMs,
      });

      createdBan = result.createdBan;
    });

    await clearUserCache(content.userId as string);
  }

  const newStrike = shouldCreateStrike
    ? existingStrike
      ? existingStrike
      : await prisma.moderationStrike.findFirstOrThrow({
          where: {
            targetContentId: contentId,
            targetType: moderationContentTypeMap[contentType],
            targetContentVersion: versionOrRevision,
            strikedBy: "AI_MODERATION",
          },
        })
    : null;

  if (shouldCreateStrike) {
    await clearStrikesCache();
  }

  await moderationMetricsQueue.add(
    finalDecision,
    {
      userId: content.userId as string,
      reviewedBy: "AI_MODERATION",
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationMetrics", decisionId, finalDecision),
    },
  );

  const meta = {
    ...baseMeta,
    ...(newStrike ? { strikeId: newStrike.id } : {}),
    action: finalDecision,
  };
  const notificationMeta = buildAiModerationNotificationMeta({
    action: finalDecision,
    reasons: aiReasons,
    expiresAt:
      finalDecision === "BAN_TEMP"
        ? new Date(Date.now() + tempBanDurationMs)
        : undefined,
  });

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
    event: "STRIKE",
    target: {
      entityType: "USER",
      entityId: content.userId as string,
    },
    meta: notificationMeta,
  });

  await clearModeratedContentCache(contentType, contentId, versionOrRevision);

  if (finalDecision === "BAN_TEMP" && createdBan) {
    await sendBanNoticeEmail({
      userId: content.userId as string,
      decisionId,
      actionTaken: finalDecision,
      reasons: aiReasons,
      banDurationMs: tempBanDurationMs,
    });
  }
};

export default handleContentModerationBan;
