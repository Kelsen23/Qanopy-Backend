import type { AdminReportActionTaken, ReportTargetType } from "../shared.js";

type ReportModerationContext = {
  reportId: string;
  reportMongoId: string;
  reportTargetUserId: string;
  targetUserExists: boolean;
  reportContentId: string;
  reportContentVersion: number | null;
  targetType: ReportTargetType;
  reviewedBy: string;
  claimToken: string;
  decisionId: string;
  reporterUserId: string;
};

type ReportStatusUpdateInput = {
  reportMongoId: string;
  reviewedBy: string;
  decisionId: string;
  reportId: string;
  reportTargetUserId: string;
  reportContentId: string;
  reportContentVersion?: number | null;
  targetType: ReportTargetType;
  reporterUserId: string;
  shouldRemoveContent: boolean;
  claimToken: string;
};

type ReportContentModerationInput = {
  reportMongoId: string;
  reportId: string;
  reportTargetUserId: string;
  targetUserExists?: boolean;
  reportContentId: string;
  reportContentVersion?: number | null;
  targetType: ReportTargetType;
  reviewedBy: string;
  claimToken: string;
  decisionId: string;
  actionTaken: AdminReportActionTaken;
};

export type {
  ReportModerationContext,
  ReportStatusUpdateInput,
  ReportContentModerationInput,
};
