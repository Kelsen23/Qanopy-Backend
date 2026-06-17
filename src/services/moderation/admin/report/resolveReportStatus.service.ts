import HttpError from "../../../../utils/httpError.util.js";

import Report from "../../../../models/report.model.js";

import { makeJobId } from "../../../../utils/makeJobId.util.js";

import moderationAuditQueue from "../../../../queues/moderationAudit.queue.js";

import routeNotification from "../../../notification/routeNotification.service.js";

import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";

import type { AdminReportActionTaken } from "../shared.js";
import type { ReportStatusUpdateInput } from "./shared.js";

const resolveReportStatus = async (
  status: "RESOLVED" | "DISMISSED",
  actionTaken: AdminReportActionTaken,
  meta: Record<string, unknown>,
  {
    reportMongoId,
    reviewedBy,
    decisionId,
    reportId,
    reportContentId,
    targetType,
    reporterUserId,
    shouldRemoveContent,
    claimToken,
  }: ReportStatusUpdateInput,
) => {
  await assertReportClaimIsCurrent({
    reportMongoId,
    reviewedBy,
    claimToken,
  });

  const updatedReport = await Report.findOneAndUpdate(
    {
      _id: reportMongoId,
      status: "PENDING",
      reviewedBy,
      claimToken,
      claimExpiresAt: { $gt: new Date() },
    },
    {
      status,
      actionTaken,
      isRemovingContent: shouldRemoveContent,
      claimedAt: null,
      claimExpiresAt: null,
      claimToken: null,
    },
    { new: true },
  );

  if (!updatedReport) {
    throw new HttpError("Report already resolved", 409);
  }

  await moderationAuditQueue.add(
    "UPDATE_REPORT_STATUS",
    {
      decisionId,
      targetType: "REPORT",
      targetId: updatedReport.id,
      targetUserId: updatedReport.targetUserId,
      actorType: "ADMIN_MODERATION",
      adminId: reviewedBy,
      actionTaken,
      meta,
    },
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId("moderationAudit", decisionId, "updateReportStatus"),
    },
  );

  await routeNotification({
    recipientId: reporterUserId,
    actorId: reviewedBy,
    event: "REPORT_UPDATE",
    target: {
      entityType: "REPORT",
      entityId: reportId,
    },
    meta: {
      reportId,
      status,
      actionTaken,
      isRemovingContent: updatedReport.isRemovingContent,
      targetContentId: reportContentId,
      targetContentType: targetType,
    },
  });
};

export default resolveReportStatus;
