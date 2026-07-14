import EligibilityGateActionLog from "../../../models/eligibilityGateActionLog.model.js";

import type { QueueQuestionGatewayAuditInput } from "../questionGatewayAudit/questionGatewayAudit.shared.js";

const processQuestionGatewayAuditJob = async (
  jobData: QueueQuestionGatewayAuditInput,
) => {
  await EligibilityGateActionLog.updateOne(
    { decisionId: jobData.decisionId },
    { $setOnInsert: jobData },
    { upsert: true },
  );
};

export default processQuestionGatewayAuditJob;
