import { makeJobId } from "../../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../../utils/cache/clearCache.util.js";

import prisma from "../../../../config/prisma.config.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

import publishSocketDisconnect from "../../../../utils/socket/publishSocketDisconnect.util.js";
import clearUserCache from "../../../../utils/cache/clearUserCache.util.js";

import routeNotification from "../../../notification/routeNotification.service.js";
import applyAdminContentModerationDecisionService from "../../applyAdminContentModerationDecision.service.js";
import applyUserBan from "../../applyUserBan.service.js";
import removeModeratedContent from "../../removeModeratedContent.service.js";
import sendBanNoticeEmail from "../../sendBanNoticeEmail.service.js";

import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";
import assertStrikeClaimIsCurrent from "./assertStrikeClaimIsCurrent.service.js";
import {
  actionToModerationStatus,
  buildStrikeModerationBaseMeta,
  type StrikeModerationContext,
  type StrikeSideEffectContext,
  type TargetContentState,
} from "./shared.js";

const moderateStrikeBanTemp = async (
  title: string,
  reasons: string[],
  banDurationMs: number,
  context: StrikeModerationContext,
  targetContentState: TargetContentState,
) => {
  const expiresAt = new Date(Date.now() + banDurationMs);
  let createdBan = false;

  const sideEffectContext: StrikeSideEffectContext = {
    decisionId: context.decisionId,
    strikeId: context.strikeId,
    actionTaken: "BAN_TEMP",
    targetUserId: context.targetUserId,
  };

  if (context.targetUserExists) {
    await runSideEffectWithRetry(
      "clearUserCache",
      async () => {
        await clearUserCache(context.targetUserId);
      },
      sideEffectContext,
    );
  }

  const baseMeta = buildStrikeModerationBaseMeta(context);
  const moderationMeta = {
    ...baseMeta,
    actionTaken: "BAN_TEMP",
    expiresAt,
    durationMs: banDurationMs,
    contentRemovalRequested: targetContentState.canRemove,
    contentRemovalQueued: false,
    targetContentState,
  };

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "BAN_TEMP",
        {
          userId: context.targetUserId,
          reviewedBy: "ADMIN_MODERATION",
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "BAN_TEMP"),
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

    const mappedStatus = actionToModerationStatus.BAN_TEMP;
    const questionVersion = context.targetContentVersion ?? undefined;

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

  let contentRemovalQueued = false;

  if (targetContentState.canRemove) {
    await assertStrikeClaimIsCurrent({
      strikeMongoId: context.strikeId,
      reviewedBy: context.reviewedBy,
      claimToken: context.claimToken,
    });

    const contentRemovalQueueResult = await runSideEffectWithRetry(
      "removeModeratedContent",
      async () => {
        return removeModeratedContent(
          context.targetType,
          context.targetContentId,
          context.targetType === "QUESTION"
            ? (context.targetContentVersion ?? undefined)
            : undefined,
        );
      },
      sideEffectContext,
    );

    contentRemovalQueued = Boolean(
      contentRemovalQueueResult.success &&
        contentRemovalQueueResult.result?.removed,
    );
  }

  if (context.targetUserExists) {
    await prisma.$transaction(async (tx) => {
      const result = await applyUserBan(tx, {
        userId: context.targetUserId,
        banType: "TEMP",
        title,
        reasons,
        bannedBy: "ADMIN_MODERATION",
        durationMs: banDurationMs,
      });

      createdBan = result.createdBan;
    });

    await runSideEffectWithRetry(
      "clearUserCache",
      async () => {
        await clearUserCache(context.targetUserId);
      },
      sideEffectContext,
    );
  }

  await runSideEffectWithRetry(
    "moderationAuditQueue:add:BAN_USER_FROM_STRIKE",
    async () => {
      await moderationAuditQueue.add(
        "BAN_USER_FROM_STRIKE",
        {
          decisionId: context.decisionId,
          targetType: "USER",
          targetId: context.targetUserId,
          targetUserId: context.targetUserId,
          actorType: "ADMIN_MODERATION",
          adminId: context.reviewedBy,
          actionTaken: "BAN_TEMP",
          meta: {
            ...moderationMeta,
            contentRemovalQueued,
            strikeId: context.strikeId,
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId(
            "moderationAudit",
            context.decisionId,
            "banUserFromStrike",
          ),
        },
      );
    },
    sideEffectContext,
  );

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
          actionTaken: "BAN_TEMP",
          meta: {
            ...moderationMeta,
            contentRemovalQueued,
          },
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

  if (contentRemovalQueued) {
    await runSideEffectWithRetry(
      "moderationAuditQueue:add:REMOVE_CONTENT",
      async () => {
        await moderationAuditQueue.add(
          "REMOVE_CONTENT",
          {
            decisionId: context.decisionId,
            targetType: "CONTENT",
            targetId: context.targetContentId,
            targetUserId: context.targetUserId,
            actorType: "ADMIN_MODERATION",
            adminId: context.reviewedBy,
            actionTaken: "REMOVE",
            meta: {
              actionTaken: "BAN_TEMP",
              strikeId: context.strikeId,
              targetType: context.targetType,
            },
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
            jobId: makeJobId(
              "moderationAudit",
              context.decisionId,
              "removeContent",
              context.targetContentId,
            ),
          },
        );
      },
      sideEffectContext,
    );
  }

  await runSideEffectWithRetry(
    "queueNotification:BAN_TEMP",
    async () => {
      await routeNotification({
        recipientId: context.targetUserId,
        event: "STRIKE",
        target: {
          entityType: "USER",
          entityId: context.targetUserId,
        },
        meta: {
          actionTaken: "BAN_TEMP",
          title,
          reasons,
          expiresAt,
          strikeId: context.strikeId,
        },
      });
    },
    sideEffectContext,
  );

  if (contentRemovalQueued) {
    await runSideEffectWithRetry(
      "queueNotification:REMOVE_CONTENT",
      async () => {
        await routeNotification({
          recipientId: context.targetUserId,
          event: "REMOVE_CONTENT",
          target: {
            entityType: context.targetType,
            entityId: context.targetContentId,
          },
          meta: {
            strikeId: context.strikeId,
            targetType: context.targetType,
            actionTaken: "BAN_TEMP",
          },
        });
      },
      sideEffectContext,
    );
  }

  if (context.targetUserExists) {
    await runSideEffectWithRetry(
      "redisPub:socket:disconnect",
      async () => {
        await publishSocketDisconnect(context.targetUserId);
      },
      sideEffectContext,
    );
  }

  await runSideEffectWithRetry(
    "clearStrikesCache",
    async () => {
      await clearStrikesCache();
    },
    sideEffectContext,
  );

  if (createdBan) {
    await sendBanNoticeEmail({
      userId: context.targetUserId,
      decisionId: context.decisionId,
      actionTaken: "BAN_TEMP",
      reasons,
      banDurationMs,
    });
  }
};

export default moderateStrikeBanTemp;
