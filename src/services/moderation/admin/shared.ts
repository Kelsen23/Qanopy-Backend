type AdminReportActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";

type ReportTargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

const actionToModerationStatus: Record<
  AdminReportActionTaken,
  "APPROVED" | "FLAGGED" | "REJECTED"
> = {
  BAN_TEMP: "REJECTED",
  BAN_PERM: "REJECTED",
  WARN: "FLAGGED",
  IGNORE: "APPROVED",
};

export type { AdminReportActionTaken, ReportTargetType };

export { actionToModerationStatus };
