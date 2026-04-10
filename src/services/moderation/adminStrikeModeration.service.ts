import crypto from "crypto";

import HttpError from "../../utils/httpError.util.js";
import queueNotification from "../../utils/queueNotification.util.js";

import { clearStrikesCache } from "../../utils/clearCache.util.js";

import prisma from "../../config/prisma.config.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

import moderationMetricsQueue from "../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../queues/moderationAudit.queue.js";
import deleteContentQueue from "../../queues/deleteContent.queue.js";

import { getRedisPub } from "../../redis/redis.pubsub.js";

import applyAiModerationDecisionService from "./applyAiModerationDecision.service.js";

type AdminStrikeActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";

type TargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

const contentModelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
  AI_ANSWER_FEEDBACK: AiAnswerFeedback,
} as const;

const actionToModerationStatus: Record<
  AdminStrikeActionTaken,
  "APPROVED" | "FLAGGED" | "REJECTED"
> = {
  BAN_TEMP: "REJECTED",
  BAN_PERM: "REJECTED",
  WARN: "FLAGGED",
  IGNORE: "APPROVED",
};

const getTargetContentState = async (
  targetType: TargetType,
  targetContentId: string,
  targetUserId: string,
) => {
  const Model = contentModelMap[targetType] as any;
  const foundContent = await Model.findById(targetContentId)
    .select("userId isActive isDeleted")
    .lean();

  if (!foundContent) {
    return {
      exists: false,
      isActive: false,
      isDeleted: false,
      ownerMatches: false,
      canRemove: false,
    };
  }

  const ownerMatches = String(foundContent.userId ?? "") === targetUserId;
  const isActive = Boolean(foundContent.isActive);
  const isDeleted = Boolean(foundContent.isDeleted);
  const canRemove = ownerMatches && isActive && !isDeleted;

  return {
    exists: true,
    isActive,
    isDeleted,
    ownerMatches,
    canRemove,
  };
};

const adminModerateStrike = async ({
  targetId,
  reviewedBy,
  reviewComment,
  actionTaken,
  title,
  reasons,
  banDurationMs,
  warningDurationMs,
}: {
  targetId: string;
  reviewedBy: string;
  reviewComment?: string;
  actionTaken: AdminStrikeActionTaken;
  title: string;
  reasons: string[];
  banDurationMs?: number;
  warningDurationMs?: number;
}) => {
  if (actionTaken === "BAN_TEMP") {
    if (banDurationMs === undefined) {
      throw new HttpError("banDurationMs is required for BAN_TEMP", 400);
    }
  }

  if (actionTaken === "WARN") {
    if (warningDurationMs === undefined) {
      throw new HttpError("warningDurationMs is required for WARN", 400);
    }
  }

  const foundStrike = await prisma.moderationStrike.findUnique({
    where: { id: targetId },
  });

  if (!foundStrike) throw new HttpError("Strike not found", 404);

  if (foundStrike.userId === reviewedBy) {
    throw new HttpError("Self-moderation is not allowed", 403);
  }

  if (foundStrike.isReviewed) {
    throw new HttpError("Strike already reviewed", 409);
  }

  const reviewedAt = new Date();
  const claimedStrike = await prisma.moderationStrike.updateMany({
    where: { id: foundStrike.id, isReviewed: false },
    data: { isReviewed: true, reviewedBy, reviewedAt },
  });

  if (claimedStrike.count === 0) {
    throw new HttpError("Strike already reviewed", 409);
  }

  const targetType = foundStrike.targetType as TargetType;
  const targetUser = await prisma.user.findUnique({
    where: { id: foundStrike.userId },
    select: { status: true },
  });

  if (!targetUser) throw new HttpError("Target user not found", 404);

  if (actionTaken !== "IGNORE" && targetUser.status === "TERMINATED") {
    throw new HttpError("Target user account is already terminated", 409);
  }

  const targetContentState = await getTargetContentState(
    targetType,
    foundStrike.targetContentId,
    foundStrike.userId,
  );

  if (targetContentState.exists && !targetContentState.ownerMatches) {
    throw new HttpError("Strike target content owner mismatch", 409);
  }

  const decisionId = crypto.randomUUID();
  const shouldRemoveContent =
    actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP";

  const baseMeta = {
    title,
    reasons: reasons,
    reviewComment,
    originalAiDecision: foundStrike.aiDecision,
    originalAiConfidence: foundStrike.aiConfidence,
    originalAiReasons: foundStrike.aiReasons,
    severity: foundStrike.severity,
    riskScore: foundStrike.riskScore,
    targetContentId: foundStrike.targetContentId,
    targetType,
    targetContentVersion: foundStrike.targetContentVersion,
  };

  const moderatedStrike = foundStrike;
  let createdBan: { id: string } | null = null;
  let createdWarning: { id: string; expiresAt: Date | null } | null = null;
  let expiresAt: Date | null = null;

  switch (actionTaken) {
    case "BAN_TEMP": {
      expiresAt = new Date(Date.now() + (banDurationMs as number));

      const result = await prisma.$transaction(async (tx) => {
        const existingTempBan = await tx.ban.findFirst({
          where: {
            userId: foundStrike.userId,
            banType: "TEMP",
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });

        if (existingTempBan) {
          throw new HttpError("User already has an active temporary ban", 409);
        }

        const existingPermBan = await tx.ban.findFirst({
          where: {
            userId: foundStrike.userId,
            banType: "PERM",
          },
          select: { id: true },
        });

        if (existingPermBan) {
          throw new HttpError("User already permanently banned", 409);
        }

        const newBan = await tx.ban.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons: reasons,
            banType: "TEMP",
            severity: foundStrike.severity ?? undefined,
            bannedBy: "ADMIN_MODERATION",
            durationMs: banDurationMs,
            expiresAt,
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: foundStrike.userId },
          data: { status: "SUSPENDED" },
        });

        return { newBan };
      });

      createdBan = result.newBan;
      break;
    }

    case "BAN_PERM": {
      const result = await prisma.$transaction(async (tx) => {
        const existingPermBan = await tx.ban.findFirst({
          where: {
            userId: foundStrike.userId,
            banType: "PERM",
          },
          select: { id: true },
        });

        if (existingPermBan) {
          throw new HttpError("User already has a permanent ban", 409);
        }

        const newBan = await tx.ban.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons: reasons,
            banType: "PERM",
            severity: foundStrike.severity ?? undefined,
            bannedBy: "ADMIN_MODERATION",
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: foundStrike.userId },
          data: { status: "TERMINATED" },
        });

        return { newBan };
      });

      createdBan = result.newBan;
      break;
    }

    case "WARN": {
      expiresAt = new Date(Date.now() + (warningDurationMs as number));

      const result = await prisma.$transaction(async (tx) => {
        const warning = await tx.warning.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons: reasons,
            severity: foundStrike.severity ?? undefined,
            warnedBy: "ADMIN_MODERATION",
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });

        return { warning };
      });

      createdWarning = result.warning;
      break;
    }

    case "IGNORE": {
      break;
    }
  }

  await moderationMetricsQueue.add(
    actionTaken,
    {
      userId: foundStrike.userId,
    },
    { removeOnComplete: true, removeOnFail: false },
  );

  await prisma.moderationStrike.update({
    where: { id: foundStrike.id },
    data: {
      isReviewed: true,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  if (targetContentState.exists && targetContentState.isActive) {
    const mappedStatus = actionToModerationStatus[actionTaken];
    const questionVersion =
      targetType === "QUESTION"
        ? (foundStrike.targetContentVersion ?? undefined)
        : undefined;

    await applyAiModerationDecisionService(
      foundStrike.targetContentId,
      targetType,
      mappedStatus,
      questionVersion,
    );
  }

  let contentRemovalQueued = false;

  if (shouldRemoveContent && targetContentState.canRemove) {
    await deleteContentQueue.add(
      "removeModeratedContent",
      {
        userId: foundStrike.userId,
        targetType,
        targetId: foundStrike.targetContentId,
      },
      { removeOnComplete: true, removeOnFail: false },
    );
    contentRemovalQueued = true;
  }

  const moderationMeta = {
    ...baseMeta,
    actionTaken,
    banDurationMs,
    warningDurationMs,
    expiresAt,
    contentRemovalQueued,
    targetContentState,
  };

  if (actionTaken === "BAN_TEMP" || actionTaken === "BAN_PERM") {
    await moderationAuditQueue.add(
      "banUserFromStrike",
      {
        decisionId,
        targetType: "USER",
        targetId: foundStrike.userId,
        targetUserId: foundStrike.userId,
        actorType: "ADMIN_MODERATION",
        adminId: reviewedBy,
        actionTaken,
        meta: {
          ...moderationMeta,
          strikeId: foundStrike.id,
        },
      },
      { removeOnComplete: true, removeOnFail: false },
    );
  }

  await moderationAuditQueue.add(
    "updateStrikeStatus",
    {
      decisionId,
      targetType: "STRIKE",
      targetId: moderatedStrike.id,
      targetUserId: foundStrike.userId,
      actorType: "ADMIN_MODERATION",
      adminId: reviewedBy,
      actionTaken,
      meta: moderationMeta,
    },
    { removeOnComplete: true, removeOnFail: false },
  );

  if (contentRemovalQueued) {
    await moderationAuditQueue.add(
      "removeContent",
      {
        decisionId,
        targetType: "CONTENT",
        targetId: foundStrike.targetContentId,
        targetUserId: foundStrike.userId,
        actorType: "ADMIN_MODERATION",
        adminId: reviewedBy,
        actionTaken: "REMOVE",
        meta: {
          actionTaken,
          strikeId: foundStrike.id,
          targetType,
        },
      },
      { removeOnComplete: true, removeOnFail: false },
    );
  }

  if (actionTaken === "WARN" && createdWarning) {
    await queueNotification({
      userId: foundStrike.userId,
      type: "WARN",
      referenceId: createdWarning.id,
      meta: {
        title,
        reasons: reasons,
        expiresAt: createdWarning.expiresAt,
        strikeId: foundStrike.id,
      },
    });
  } else {
    await queueNotification({
      userId: foundStrike.userId,
      type: "STRIKE",
      referenceId: moderatedStrike.id,
      meta: {
        actionTaken,
        title,
        reasons: reasons,
        expiresAt,
        strikeId: moderatedStrike.id,
      },
    });
  }

  if (contentRemovalQueued) {
    await queueNotification({
      userId: foundStrike.userId,
      type: "REMOVE_CONTENT",
      referenceId: foundStrike.targetContentId,
      meta: {
        strikeId: moderatedStrike.id,
        targetType,
        actionTaken,
      },
    });
  }

  if (
    (actionTaken === "BAN_TEMP" || actionTaken === "BAN_PERM") &&
    createdBan
  ) {
    getRedisPub().publish(
      "socket:disconnect",
      JSON.stringify(foundStrike.userId),
    );
  }

  await clearStrikesCache();
};

export default adminModerateStrike;
