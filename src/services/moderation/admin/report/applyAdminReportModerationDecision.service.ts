import applyContentModerationDecisionService from "../../applyContentModerationDecision.service.js";

import {
  actionToModerationStatus,
  type AdminReportActionTaken,
  type ReportTargetType,
} from "../shared.js";

import assertReportClaimIsCurrent from "./assertReportClaimIsCurrent.service.js";

type ApplyAdminReportModerationDecisionInput = {
  reportMongoId: string;
  reportContentId: string;
  targetType: ReportTargetType;
  actionTaken: AdminReportActionTaken;
  reviewedBy: string;
  decisionId: string;
  reportId: string;
  claimToken: string;
};

const buildLogContext = ({
  decisionId,
  reportId,
  reportContentId,
  targetType,
  mappedStatus,
}: {
  reportMongoId: string;
  decisionId: string;
  reportId: string;
  reportContentId: string;
  targetType: ReportTargetType;
  mappedStatus: "APPROVED" | "FLAGGED" | "REJECTED";
}) => ({
  decisionId,
  reportId,
  reportContentId,
  targetType,
  mappedStatus,
});

const applyAdminReportModerationDecision = async ({
  reportContentId,
  targetType,
  actionTaken,
  reviewedBy,
  reportMongoId,
  claimToken,
  decisionId,
  reportId,
}: ApplyAdminReportModerationDecisionInput) => {
  const mappedStatus = actionToModerationStatus[actionTaken];

  try {
    await assertReportClaimIsCurrent({
      reportMongoId,
      reviewedBy,
      claimToken,
    });

    await applyContentModerationDecisionService(
      reportContentId,
      targetType,
      mappedStatus,
      undefined,
      "http",
    );
  } catch (error) {
    console.error(
      "[adminModerateReport] Failed to apply admin moderation decision",
      {
        ...buildLogContext({
          decisionId,
          reportId,
          reportMongoId,
          reportContentId,
          targetType,
          mappedStatus,
        }),
        error,
      },
    );
  }
};

export default applyAdminReportModerationDecision;
