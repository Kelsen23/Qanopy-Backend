import crypto from "crypto";
import { setTimeout as sleep } from "node:timers/promises";

import HttpError from "../../utils/httpError.util.js";
import { clearStrikesCache } from "../../utils/clearCache.util.js";
import { makeJobId } from "../../utils/makeJobId.util.js";

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
import routeNotification from "../notification/routeNotification.service.js";

type AdminStrikeActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";

type TargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

type SideEffectContext = {
  decisionId: string;
  strikeId: string;
  actionTaken: AdminStrikeActionTaken;
  targetUserId: string;
};

type SideEffectResult = {
  success: boolean;
  attempts: number;
};

const SIDE_EFFECT_RETRY_DELAYS_MS = [0, 200, 600] as const;

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

const runSideEffectWithRetry = async (
  effectName: string,
  fn: () => Promise<unknown>,
  context: SideEffectContext,
): Promise<SideEffectResult> => {
  let lastError: unknown;

  for (let i = 0; i < SIDE_EFFECT_RETRY_DELAYS_MS.length; i++) {
    const delayMs = SIDE_EFFECT_RETRY_DELAYS_MS[i];
    if (delayMs > 0) await sleep(delayMs);

    try {
      await fn();
      return { success: true, attempts: i + 1 };
    } catch (error) {
      lastError = error;
    }
  }

  console.error("[adminModerateStrike] Non-critical side effect failed", {
    ...context,
    effectName,
    attempts: SIDE_EFFECT_RETRY_DELAYS_MS.length,
    error: lastError,
  });

  return { success: false, attempts: SIDE_EFFECT_RETRY_DELAYS_MS.length };
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

  const preCheckStrike = await prisma.moderationStrike.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      userId: true,
      targetType: true,
      targetContentId: true,
    },
  });

  if (!preCheckStrike) throw new HttpError("Strike not found", 404);

  const preCheckTargetType = preCheckStrike.targetType as TargetType;
  const preCheckTargetContentState = await getTargetContentState(
    preCheckTargetType,
    preCheckStrike.targetContentId,
    preCheckStrike.userId,
  );

  if (
    preCheckTargetContentState.exists &&
    !preCheckTargetContentState.ownerMatches
  ) {
    throw new HttpError("Strike target content owner mismatch", 409);
  }

  const reviewedAt = new Date();

  const transactionResult = await prisma.$transaction(async (tx) => {
    const foundStrike = await tx.moderationStrike.findUnique({
      where: { id: targetId },
    });

    if (!foundStrike) throw new HttpError("Strike not found", 404);

    if (foundStrike.userId === reviewedBy) {
      throw new HttpError("Self-moderation is not allowed", 403);
    }

    if (foundStrike.isReviewed) {
      throw new HttpError("Strike already reviewed", 409);
    }

    const claimedStrike = await tx.moderationStrike.updateMany({
      where: { id: foundStrike.id, isReviewed: false },
      data: { isReviewed: true, reviewedBy, reviewedAt },
    });

    if (claimedStrike.count === 0) {
      throw new HttpError("Strike already reviewed", 409);
    }

    const targetUser = await tx.user.findUnique({
      where: { id: foundStrike.userId },
      select: { status: true },
    });

    if (!targetUser) throw new HttpError("Target user not found", 404);

    if (actionTaken !== "IGNORE" && targetUser.status === "TERMINATED") {
      throw new HttpError("Target user account is already terminated", 409);
    }

    let createdBan: { id: string } | null = null;
    let createdWarning: { id: string; expiresAt: Date | null } | null = null;
    let expiresAt: Date | null = null;

    switch (actionTaken) {
      case "BAN_TEMP": {
        expiresAt = new Date(Date.now() + (banDurationMs as number));

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

        createdBan = await tx.ban.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons,
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

        break;
      }

      case "BAN_PERM": {
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

        createdBan = await tx.ban.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons,
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

        break;
      }

      case "WARN": {
        expiresAt = new Date(Date.now() + (warningDurationMs as number));

        createdWarning = await tx.warning.create({
          data: {
            userId: foundStrike.userId,
            title,
            reasons,
            severity: foundStrike.severity ?? undefined,
            warnedBy: "ADMIN_MODERATION",
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });

        break;
      }

      case "IGNORE": {
        break;
      }
    }

    return {
      foundStrike,
      createdBan,
      createdWarning,
      expiresAt,
    };
  });

  const { foundStrike, createdBan, createdWarning, expiresAt } =
    transactionResult;
  const targetType = foundStrike.targetType as TargetType;
  const decisionId = crypto.randomUUID();

  const context: SideEffectContext = {
    decisionId,
    strikeId: foundStrike.id,
    actionTaken,
    targetUserId: foundStrike.userId,
  };

  let targetContentState = {
    exists: false,
    isActive: false,
    isDeleted: false,
    ownerMatches: false,
    canRemove: false,
  };

  try {
    targetContentState = await getTargetContentState(
      targetType,
      foundStrike.targetContentId,
      foundStrike.userId,
    );
  } catch (error) {
    console.error(
      "[adminModerateStrike] Failed to load target content state post-commit",
      {
        ...context,
        targetType,
        targetContentId: foundStrike.targetContentId,
        error,
      },
    );
  }

  const shouldRemoveContent =
    actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP";

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        actionTaken,
        {
          userId: foundStrike.userId,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", decisionId, actionTaken),
        },
      );
    },
    context,
  );

  if (targetContentState.exists && targetContentState.isActive) {
    const mappedStatus = actionToModerationStatus[actionTaken];
    const questionVersion =
      targetType === "QUESTION"
        ? (foundStrike.targetContentVersion ?? undefined)
        : undefined;

    await runSideEffectWithRetry(
      "applyAiModerationDecisionService",
      async () => {
        await applyAiModerationDecisionService(
          foundStrike.targetContentId,
          targetType,
          mappedStatus,
          questionVersion,
        );
      },
      context,
    );
  }

  let contentRemovalQueued = false;

  if (shouldRemoveContent && targetContentState.canRemove) {
    const contentRemovalQueueResult = await runSideEffectWithRetry(
      "deleteContentQueue:add",
      async () => {
        await deleteContentQueue.add(
          "REMOVE_MODERATED_CONTENT",
          {
            userId: foundStrike.userId,
            targetType,
            targetId: foundStrike.targetContentId,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "deleteContent",
              decisionId,
              "REMOVE_MODERATED_CONTENT",
              targetType,
              foundStrike.targetContentId,
            ),
          },
        );
      },
      context,
    );

    contentRemovalQueued = contentRemovalQueueResult.success;
  }

  const baseMeta = {
    title,
    reasons,
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

  const moderationMeta = {
    ...baseMeta,
    actionTaken,
    banDurationMs,
    warningDurationMs,
    expiresAt,
    contentRemovalRequested:
      shouldRemoveContent && targetContentState.canRemove,
    contentRemovalQueued,
    targetContentState,
  };

  if (actionTaken === "BAN_TEMP" || actionTaken === "BAN_PERM") {
    await runSideEffectWithRetry(
      "moderationAuditQueue:add:BAN_USER_FROM_STRIKE",
      async () => {
        await moderationAuditQueue.add(
          "BAN_USER_FROM_STRIKE",
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
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "moderationAudit",
              decisionId,
              "banUserFromStrike",
            ),
          },
        );
      },
      context,
    );
  }

  await runSideEffectWithRetry(
    "moderationAuditQueue:add:UPDATE_STRIKE_STATUS",
    async () => {
      await moderationAuditQueue.add(
        "UPDATE_STRIKE_STATUS",
        {
          decisionId,
          targetType: "STRIKE",
          targetId: foundStrike.id,
          targetUserId: foundStrike.userId,
          actorType: "ADMIN_MODERATION",
          adminId: reviewedBy,
          actionTaken,
          meta: moderationMeta,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationAudit", decisionId, "updateStrikeStatus"),
        },
      );
    },
    context,
  );

  if (contentRemovalQueued) {
    await runSideEffectWithRetry(
      "moderationAuditQueue:add:REMOVE_CONTENT",
      async () => {
        await moderationAuditQueue.add(
          "REMOVE_CONTENT",
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
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "moderationAudit",
              decisionId,
              "removeContent",
              foundStrike.targetContentId,
            ),
          },
        );
      },
      context,
    );
  }

  if (actionTaken === "WARN" && createdWarning) {
    await runSideEffectWithRetry(
      "queueNotification:WARN",
      async () => {
        await routeNotification({
          recipientId: foundStrike.userId,
          actorId: reviewedBy,
          event: "WARN",
          target: {
            entityType: "USER",
            entityId: foundStrike.userId,
          },
          meta: {
            title,
            reasons,
            expiresAt: createdWarning.expiresAt,
            strikeId: foundStrike.id,
          },
        });
      },
      context,
    );
  } else {
    await runSideEffectWithRetry(
      "queueNotification:STRIKE",
      async () => {
        await routeNotification({
          recipientId: foundStrike.userId,
          actorId: reviewedBy,
          event: "STRIKE",
          target: {
            entityType: "USER",
            entityId: foundStrike.userId,
          },
          meta: {
            actionTaken,
            title,
            reasons,
            expiresAt,
            strikeId: foundStrike.id,
          },
        });
      },
      context,
    );
  }

  if (contentRemovalQueued) {
    await runSideEffectWithRetry(
      "queueNotification:",
      async () => {
        await routeNotification({
          recipientId: foundStrike.userId,
          actorId: reviewedBy,
          event: "REMOVE_CONTENT",
          target: {
            entityType: targetType,
            entityId: foundStrike.targetContentId,
          },
          meta: {
            strikeId: foundStrike.id,
            targetType,
            actionTaken,
          },
        });
      },
      context,
    );
  }

  if (
    (actionTaken === "BAN_TEMP" || actionTaken === "BAN_PERM") &&
    createdBan
  ) {
    await runSideEffectWithRetry(
      "redisPub:socket:disconnect",
      async () => {
        await getRedisPub().publish(
          "socket:disconnect",
          JSON.stringify(foundStrike.userId),
        );
      },
      context,
    );
  }

  await runSideEffectWithRetry(
    "clearStrikesCache",
    async () => {
      await clearStrikesCache();
    },
    context,
  );
};

export default adminModerateStrike;
