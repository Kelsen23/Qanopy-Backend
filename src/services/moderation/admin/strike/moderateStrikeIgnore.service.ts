import { makeJobId } from "../../../../utils/job/makeJobId.util.js";
import { clearStrikesCache } from "../../../../utils/cache/clearCache.util.js";

import moderationMetricsQueue from "../../../../queues/moderationMetrics.queue.js";
import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

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
        {
          userId: context.targetUserId,
          reviewedBy: "ADMIN_MODERATION",
        },
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
    await assertStrikeClaimIsCurrent({
      strikeMongoId: context.strikeId,
      reviewedBy: context.reviewedBy,
      claimToken: context.claimToken,
    });

    const mappedStatus = actionToModerationStatus.IGNORE;
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
    "clearStrikesCache",
    async () => {
      await clearStrikesCache();
    },
    sideEffectContext,
  );
};

export default moderateStrikeIgnore;
