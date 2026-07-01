import ModActionLog from "../../../models/modActionLog.model.js";

const processModerationAuditJob = async (jobData: {
  decisionId: string;
  targetType: string;
  targetId: string;
  targetUserId: string;
  actorType: string;
  adminId: string;
  actionTaken: string;
  meta: unknown;
}) => {
  const {
    decisionId,
    targetType,
    targetId,
    targetUserId,
    actorType,
    adminId,
    actionTaken,
    meta,
  } = jobData;

  await ModActionLog.create({
    decisionId,
    targetType,
    targetId,
    targetUserId,
    actorType,
    adminId,
    actionTaken,
    meta,
  });
};

export default processModerationAuditJob;
