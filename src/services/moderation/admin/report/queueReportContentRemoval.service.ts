import { makeJobId } from "../../../../utils/makeJobId.util.js";

import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";
import deleteContentQueue from "../../../../queues/deleteContent.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";
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

  await runSideEffectWithRetry(
    "deleteContentQueue:add",
    async () => {
      await deleteContentQueue.add(
        "REMOVE_MODERATED_CONTENT",
        {
          userId: reportTargetUserId,
          targetType,
          targetId: reportContentId,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
          jobId: makeJobId(
            "deleteContent",
            decisionId,
            "REMOVE_MODERATED_CONTENT",
            targetType,
            reportContentId,
          ),
        },
      );
    },
    { reportMongoId, reviewedBy, claimToken, decisionId, reportId },
  );

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
        actorId: reviewedBy,
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
