import { makeJobId } from "../../../../utils/makeJobId.util.js";

import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";
import deleteContentQueue from "../../../../queues/deleteContent.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";

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
};

export default queueReportContentRemoval;
