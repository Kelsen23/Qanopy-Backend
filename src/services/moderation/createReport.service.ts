import HttpError from "../../utils/http/httpError.util.js";
import { clearReportsCache } from "../../utils/cache/clearCache.util.js";

import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";
import Answer from "../../models/answer.model.js";
import Question from "../../models/question.model.js";
import Reply from "../../models/reply.model.js";
import Report from "../../models/report.model.js";

type ReportTargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";
type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "HATE_SPEECH"
  | "INAPPROPRIATE_CONTENT"
  | "MISINFORMATION"
  | "OTHER";

type ActionTaken =
  | "PENDING"
  | "IGNORE"
  | "WARN"
  | "BAN_TEMP"
  | "BANE_PERM"
  | null;

interface CreateReportInput {
  reportedBy: string;
  targetId: string;
  targetType: ReportTargetType;
  targetContentVersion?: number;
  reportReason: ReportReason;
  reportComment?: string;
}

interface CreatedReport {
  id: string;
  reportedBy: string;
  targetId: string;
  targetContentVersion?: number | null;
  targetUserId: string;
  targetType: ReportTargetType;
  reportReason: ReportReason;
  reportComment: string | null;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  reviewedBy?: string | null;
  claimedBy?: string | null;
  claimedAt?: Date | null;
  claimExpiresAt?: Date | null;
  claimToken?: string | null;
  reviewComment?: string | null;
  actionTaken?: ActionTaken;
  isRemovingContent?: boolean | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sanitizeReport = (report: CreatedReport) => {
  const {
    status,
    claimedBy,
    claimedAt,
    claimExpiresAt,
    claimToken,
    reviewComment,
    actionTaken,
    isRemovingContent,
    reviewedAt,
    ...rest
  } = report;

  return rest;
};

const findTargetContent = async (
  targetId: string,
  targetType: ReportTargetType,
) => {
  switch (targetType) {
    case "QUESTION":
      return Question.findOne(
        { _id: targetId, isActive: true },
        { userId: 1, currentVersion: 1 },
      );

    case "ANSWER":
      return Answer.findOne({ _id: targetId, isActive: true }, { userId: 1 });

    case "REPLY":
      return Reply.findOne({ _id: targetId, isActive: true }, { userId: 1 });

    case "AI_ANSWER_FEEDBACK":
      return AiAnswerFeedback.findOne(
        { _id: targetId, isActive: true },
        { userId: 1 },
      );
  }
};

const createReport = async ({
  reportedBy,
  targetId,
  targetType,
  targetContentVersion,
  reportReason,
  reportComment,
}: CreateReportInput) => {
  const foundContent = await findTargetContent(targetId, targetType);

  if (!foundContent) {
    throw new HttpError("Target content not found", 404);
  }

  if (
    targetType === "QUESTION" &&
    Number((foundContent as { currentVersion?: number }).currentVersion ?? 1) <
      Number(targetContentVersion)
  ) {
    throw new HttpError("Target question version not found", 404);
  }

  const report = await Report.create({
    reportedBy,
    targetId,
    targetContentVersion:
      targetType === "QUESTION" ? (targetContentVersion ?? null) : null,
    targetUserId: foundContent.userId,
    targetType,
    reportReason,
    reportComment,
  });

  await clearReportsCache();

  return {
    report: sanitizeReport(report.toJSON() as unknown as CreatedReport),
  };
};

export default createReport;
