import prisma from "../../../config/prisma.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../utils/cache/clearCache.util.js";
import clearUserCache from "../../../utils/cache/clearUserCache.util.js";
import buildAiModerationNotificationMeta from "../../../utils/moderation/aiModerationNotificationMeta.util.js";

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
  tempBanDurationMs: number;
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
  tempBanDurationMs,
  baseMeta,
  decisionId,
  content,
}: HandleContentModerationBanInput) => {
  const existingStrike = await prisma.moderationStrike.findFirst({
    where: {
      targetContentId: contentId,
      targetType: moderationContentTypeMap[contentType],
      targetContentVersion: versionOrRevision,
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

  if (content.userId) {
    await prisma.$transaction(async (tx) => {
      if (finalDecision === "BAN_PERM") {
        const existingPermBan = await tx.ban.findFirst({
          where: { userId: content.userId as string, banType: "PERM" },
        });

        if (!existingPermBan) {
          await tx.ban.create({
            data: {
              userId: content.userId as string,
              title: "AI moderation ban",
              reasons: aiReasons,
              banType: "PERM",
              bannedBy: "AI_MODERATION",
            },
          });
        }

        await tx.user.update({
          where: { id: content.userId as string },
          data: { status: "TERMINATED" },
        });

        return;
      }

      const existingPermBan = await tx.ban.findFirst({
        where: { userId: content.userId as string, banType: "PERM" },
      });

      if (existingPermBan) {
        await tx.user.update({
          where: { id: content.userId as string },
          data: { status: "TERMINATED" },
        });

        return;
      }

      const existingTempBan = await tx.ban.findFirst({
        where: {
          userId: content.userId as string,
          banType: "TEMP",
          expiresAt: { gt: new Date() },
        },
      });

      if (!existingTempBan) {
        await tx.ban.create({
          data: {
            userId: content.userId as string,
            title: "AI moderation ban",
            reasons: aiReasons,
            banType: "TEMP",
            bannedBy: "AI_MODERATION",
            expiresAt: new Date(Date.now() + tempBanDurationMs),
            durationMs: tempBanDurationMs,
          },
        });
      }

      await tx.user.update({
        where: { id: content.userId as string },
        data: { status: "SUSPENDED" },
      });
    });

    await clearUserCache(content.userId as string);
  }

  const newStrike = existingStrike
    ? existingStrike
    : await prisma.moderationStrike.findFirstOrThrow({
        where: {
          targetContentId: contentId,
          targetType: moderationContentTypeMap[contentType],
          targetContentVersion: versionOrRevision,
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

  await sendBanNoticeEmail({
    userId: content.userId as string,
    decisionId,
    actionTaken: finalDecision,
    reasons: aiReasons,
    banDurationMs: finalDecision === "BAN_TEMP" ? tempBanDurationMs : undefined,
  });
};

export default handleContentModerationBan;
