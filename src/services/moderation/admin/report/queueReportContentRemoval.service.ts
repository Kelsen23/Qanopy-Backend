import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";
import removeModeratedContent from "../../removeModeratedContent.service.js";
import runSideEffectWithRetry from "../runSideEffectWithRetry.service.js";

import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";

import type { ReportContentModerationInput } from "./shared.js";

const queueReportContentRemoval = async (
  meta: Record<string, unknown>,
  {
    reportMongoId,
    reportId,
    reportTargetUserId,
    reportContentId,
    reportContentVersion,
    targetType,
    reviewedBy,
    claimToken,
    decisionId,
    actionTaken,
  }: ReportContentModerationInput,
) => {
  await assertReportClaimIsCurrent({
    reportMongoId,
    reviewedBy,
    claimToken,
  });

  const contentRemovalResult = await runSideEffectWithRetry(
    "removeModeratedContent",
    async () => {
      return removeModeratedContent(
        targetType,
        reportContentId,
        targetType === "QUESTION"
          ? (reportContentVersion ?? undefined)
          : undefined,
      );
    },
    { reportMongoId, reviewedBy, claimToken, decisionId, reportId },
  );

  if (!contentRemovalResult.success || !contentRemovalResult.result?.removed) {
    return;
  }

  await runSideEffectWithRetry(
    "moderationAuditQueue:add:REMOVE_CONTENT",
    async () => {
      await moderationAuditQueue.add(
        "REMOVE_CONTENT",
        {
          decisionId,
          targetType: "CONTENT",
          targetId: reportContentId,
          targetUserId: reportTargetUserId,
          actorType: "ADMIN_MODERATION",
          adminId: reviewedBy,
          actionTaken: "REMOVE",
          meta,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId("moderationAudit", decisionId, "removeContent"),
        },
      );
    },
    { reportMongoId, reviewedBy, claimToken, decisionId, reportId },
  );

  await runSideEffectWithRetry(
    "queueNotification:REMOVE_CONTENT",
    async () => {
      await routeNotification({
        recipientId: reportTargetUserId,
        event: "REMOVE_CONTENT",
        target: {
          entityType: targetType,
          entityId: reportContentId,
        },
        meta: {
          reportId,
          targetType,
          actionTaken,
        },
      });
    },
    { reportMongoId, reviewedBy, claimToken, decisionId, reportId },
  );
};

export default queueReportContentRemoval;
