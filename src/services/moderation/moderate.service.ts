import adminModerateReportService from "./adminReportModeration.service.js";
import adminModerateStrikeService from "./adminStrikeModeration.service.js";
import {
  addAdminModPoints,
  checkAdminModPointsLimit,
} from "./modPoints.service.js";

type ModerationType = "REPORT" | "STRIKE";
type ModerationActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";
type ModerationTargetType =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

interface ModerateInput {
  userId: string;
  type: ModerationType;
  targetId: string;
  targetType: ModerationTargetType;
  reviewComment?: string;
  actionTaken: ModerationActionTaken;
  title: string;
  reasons: string[];
  banDurationMs?: number;
  warningDurationMs?: number;
}

const moderate = async ({
  userId,
  type,
  actionTaken,
  ...payload
}: ModerateInput) => {
  await checkAdminModPointsLimit(userId);

  if (type === "REPORT") {
    await adminModerateReportService({
      ...payload,
      actionTaken,
      reviewedBy: userId,
    });
  } else {
    await adminModerateStrikeService({
      ...payload,
      actionTaken,
      reviewedBy: userId,
    });
  }

  await addAdminModPoints(userId, actionTaken);

  return {
    message: `Successfully moderated ${type.toLowerCase()}`,
  };
};

export default moderate;
