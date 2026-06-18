import crypto from "crypto";

import HttpError from "../../../../utils/httpError.util.js";
import { clearStrikesCache } from "../../../../utils/clearCache.util.js";

import prisma from "../../../../config/prisma.config.js";

import getTargetContentState from "./getTargetContentState.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";
import finalizeStrikeReview from "./finalizeStrikeReview.service.js";
import moderateStrikeBanTemp from "./moderateStrikeBanTemp.service.js";
import moderateStrikeBanPerm from "./moderateStrikeBanPerm.service.js";
import moderateStrikeWarn from "./moderateStrikeWarn.service.js";
import moderateStrikeIgnore from "./moderateStrikeIgnore.service.js";

import type {
  AdminStrikeActionTaken,
  StrikeModerationContext,
  StrikeTargetType,
  TargetContentState,
} from "./shared.js";

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
  const preCheckStrike = await prisma.moderationStrike.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      userId: true,
      targetType: true,
      targetContentId: true,
      targetContentVersion: true,
      aiDecision: true,
      aiConfidence: true,
      aiReasons: true,
      severity: true,
      riskScore: true,
    },
  });

  if (!preCheckStrike) {
    throw new HttpError("Strike not found", 404);
  }

  const preCheckTargetType = preCheckStrike.targetType as StrikeTargetType;
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
  const claimToken = crypto.randomUUID();

  const transactionResult = await prisma.$transaction(async (tx) => {
    const foundStrike = await tx.moderationStrike.findUnique({
      where: { id: targetId },
    });

    if (!foundStrike) {
      throw new HttpError("Strike not found", 404);
    }

    if (foundStrike.actionTaken !== "PENDING") {
      throw new HttpError("Strike already reviewed", 409);
    }

    const claimedStrike = await tx.moderationStrike.updateMany({
      where: {
        id: foundStrike.id,
        actionTaken: "PENDING",
        OR: [{ reviewedBy: null }, { claimExpiresAt: { lte: reviewedAt } }],
      },
      data: {
        reviewedBy,
        reviewedAt,
        reviewComment: reviewComment ?? null,
        claimedAt: reviewedAt,
        claimExpiresAt: new Date(reviewedAt.getTime() + 24 * 60 * 60 * 1000),
        claimToken,
      },
    });

    if (claimedStrike.count === 0) {
      throw new HttpError("Strike already reviewed", 409);
    }

    const targetUser = await tx.user.findUnique({
      where: { id: foundStrike.userId },
      select: { id: true, status: true },
    });

    const targetUserExists = Boolean(targetUser);

    if (actionTaken !== "IGNORE" && targetUser?.status === "TERMINATED") {
      throw new HttpError("Target user account is already terminated", 409);
    }

    if ((targetUser?.id as string).toString() === reviewedBy) {
      throw new HttpError("Cannot moderate yourself", 403);
    }

    return {
      foundStrike,
      targetUserExists,
    };
  });

  const { foundStrike, targetUserExists } = transactionResult;
  const targetType = foundStrike.targetType as StrikeTargetType;
  const targetContentState = (await getTargetContentState(
    targetType,
    foundStrike.targetContentId,
    foundStrike.userId,
  )) as TargetContentState;

  const decisionId = crypto.randomUUID();
  const context: StrikeModerationContext = {
    strikeId: foundStrike.id,
    targetUserId: foundStrike.userId,
    targetContentId: foundStrike.targetContentId,
    targetType,
    targetContentVersion: foundStrike.targetContentVersion ?? null,
    reviewedBy,
    reviewComment,
    actionTaken,
    title,
    reasons,
    decisionId,
    claimToken,
    targetUserExists,
    originalAiDecision: foundStrike.aiDecision ?? null,
    originalAiConfidence: foundStrike.aiConfidence ?? null,
    originalAiReasons: foundStrike.aiReasons ?? [],
    severity: foundStrike.severity ?? null,
    riskScore: foundStrike.riskScore ?? null,
  };

  try {
    const isRemovingContent =
      (actionTaken === "BAN_PERM" || actionTaken === "BAN_TEMP") &&
      targetContentState.canRemove;

    switch (actionTaken) {
      case "BAN_TEMP":
        await moderateStrikeBanTemp(
          title,
          reasons,
          banDurationMs as number,
          context,
          targetContentState,
        );
        break;

      case "BAN_PERM":
        await moderateStrikeBanPerm(
          title,
          reasons,
          context,
          targetContentState,
        );
        break;

      case "WARN":
        await moderateStrikeWarn(
          title,
          reasons,
          warningDurationMs as number,
          context,
          targetContentState,
        );
        break;

      case "IGNORE":
        await moderateStrikeIgnore(title, reasons, context, targetContentState);
        break;
    }

    await finalizeStrikeReview({
      strikeMongoId: foundStrike.id,
      reviewedBy,
      claimToken,
      actionTaken,
      isRemovingContent,
    });

    await runSideEffectWithRetry(
      "clearStrikesCache",
      async () => {
        await clearStrikesCache();
      },
      {
        decisionId,
        strikeId: foundStrike.id,
        actionTaken,
        targetUserId: foundStrike.userId,
      },
    );
  } catch (error) {
    await prisma.moderationStrike.updateMany({
      where: {
        id: foundStrike.id,
        reviewedBy,
        claimToken,
      },
      data: {
        reviewedBy: null,
        reviewedAt: null,
        reviewComment: null,
        claimedAt: null,
        claimExpiresAt: null,
        claimToken: null,
      },
    });

    await runSideEffectWithRetry(
      "clearStrikesCache",
      async () => {
        await clearStrikesCache();
      },
      {
        decisionId,
        strikeId: foundStrike.id,
        actionTaken,
        targetUserId: foundStrike.userId,
      },
    );

    throw error;
  }
};

export default adminModerateStrike;
