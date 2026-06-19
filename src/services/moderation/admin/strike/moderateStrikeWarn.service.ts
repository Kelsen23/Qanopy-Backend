import { makeJobId } from "../../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../../utils/cache/clearCache.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";
import applyAdminContentModerationDecisionService from "../../applyAdminContentModerationDecision.service.js";

import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";
import assertStrikeClaimIsCurrent from "./assertStrikeClaimIsCurrent.service.js";
import {
  actionToModerationStatus,
  buildStrikeModerationBaseMeta,
  type StrikeModerationContext,
  type StrikeSideEffectContext,
  type TargetContentState,
} from "./shared.js";

const moderateStrikeWarn = async (
  title: string,
  reasons: string[],
  warningDurationMs: number,
  context: StrikeModerationContext,
  targetContentState: TargetContentState,
) => {
  const expiresAt = new Date(Date.now() + warningDurationMs);

  if (context.targetUserExists) {
    await prisma.warning.create({
      data: {
        userId: context.targetUserId,
        title,
        reasons,
        warnedBy: "ADMIN_MODERATION",
        expiresAt,
      },
    });
  }

  const sideEffectContext: StrikeSideEffectContext = {
    decisionId: context.decisionId,
    strikeId: context.strikeId,
    actionTaken: "WARN",
    targetUserId: context.targetUserId,
  };

  const baseMeta = buildStrikeModerationBaseMeta(context);
  const moderationMeta = {
    ...baseMeta,
    actionTaken: "WARN",
    expiresAt,
    targetContentState,
  };

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "WARN",
        { userId: context.targetUserId },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "WARN"),
        },
      );
    },
    sideEffectContext,
  );

  if (targetContentState.exists && targetContentState.isActive) {
    await assertStrikeClaimIsCurrent({
      strikeMongoId: context.strikeId,
      reviewedBy: context.reviewedBy,
      claimToken: context.claimToken,
    });

    const mappedStatus = actionToModerationStatus.WARN;
    const questionVersion =
      context.targetType === "QUESTION"
        ? (context.targetContentVersion ?? undefined)
        : undefined;

    const moderationApplyResult = await runSideEffectWithRetry(
      "applyAdminContentModerationDecisionService",
      async () => {
        await applyAdminContentModerationDecisionService(
          context.targetContentId,
          context.targetType,
          mappedStatus,
          questionVersion,
        );
      },
      sideEffectContext,
    );

    if (!moderationApplyResult.success) {
      throw new Error("Failed to apply admin content moderation decision");
    }
  }

  await runSideEffectWithRetry(
    "moderationAuditQueue:add:UPDATE_STRIKE_STATUS",
    async () => {
      await moderationAuditQueue.add(
        "UPDATE_STRIKE_STATUS",
        {
          decisionId: context.decisionId,
          targetType: "STRIKE",
          targetId: context.strikeId,
          targetUserId: context.targetUserId,
          actorType: "ADMIN_MODERATION",
          adminId: context.reviewedBy,
          actionTaken: "WARN",
          meta: moderationMeta,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId(
            "moderationAudit",
            context.decisionId,
            "updateStrikeStatus",
          ),
        },
      );
    },
    sideEffectContext,
  );

  await runSideEffectWithRetry(
    "queueNotification:WARN",
    async () => {
      await routeNotification({
        recipientId: context.targetUserId,
        actorId: context.reviewedBy,
        event: "WARN",
        target: {
          entityType: "USER",
          entityId: context.targetUserId,
        },
        meta: {
          title,
          reasons,
          expiresAt,
          strikeId: context.strikeId,
        },
      });
    },
    sideEffectContext,
  );

  await runSideEffectWithRetry(
    "clearStrikesCache",
    async () => {
      await clearStrikesCache();
    },
    sideEffectContext,
  );
};

export default moderateStrikeWarn;
