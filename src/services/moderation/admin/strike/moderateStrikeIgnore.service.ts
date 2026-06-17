import { makeJobId } from "../../../../utils/makeJobId.util.js";
import { clearStrikesCache } from "../../../../utils/clearCache.util.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";
import applyContentModerationDecisionService from "../../applyContentModerationDecision.service.js";

import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";
import {
  actionToModerationStatus,
  buildStrikeModerationBaseMeta,
  type StrikeModerationContext,
  type StrikeSideEffectContext,
  type TargetContentState,
} from "./shared.js";

const moderateStrikeIgnore = async (
  title: string,
  reasons: string[],
  context: StrikeModerationContext,
  targetContentState: TargetContentState,
) => {
  const sideEffectContext: StrikeSideEffectContext = {
    decisionId: context.decisionId,
    strikeId: context.strikeId,
    actionTaken: "IGNORE",
    targetUserId: context.targetUserId,
  };

  const baseMeta = buildStrikeModerationBaseMeta(context);
  const moderationMeta = {
    ...baseMeta,
    actionTaken: "IGNORE",
    targetContentState,
  };

  await runSideEffectWithRetry(
    "moderationMetricsQueue:add",
    async () => {
      await moderationMetricsQueue.add(
        "IGNORE",
        { userId: context.targetUserId },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationMetrics", context.decisionId, "IGNORE"),
        },
      );
    },
    sideEffectContext,
  );

  if (targetContentState.exists && targetContentState.isActive) {
    const mappedStatus = actionToModerationStatus.IGNORE;
    const questionVersion =
      context.targetType === "QUESTION"
        ? (context.targetContentVersion ?? undefined)
        : undefined;

    await runSideEffectWithRetry(
      "applyContentModerationDecisionService",
      async () => {
        await applyContentModerationDecisionService(
          context.targetContentId,
          context.targetType,
          mappedStatus,
          questionVersion,
          "http",
        );
      },
      sideEffectContext,
    );
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
          actionTaken: "IGNORE",
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
    "queueNotification:STRIKE",
    async () => {
      await routeNotification({
        recipientId: context.targetUserId,
        actorId: context.reviewedBy,
        event: "STRIKE",
        target: {
          entityType: "USER",
          entityId: context.targetUserId,
        },
        meta: {
          actionTaken: "IGNORE",
          title,
          reasons,
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

export default moderateStrikeIgnore;
