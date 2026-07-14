import questionGatewayAuditQueue from "../../../queues/questionGatewayAudit.queue.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import type { QueueQuestionGatewayAuditInput } from "./questionGatewayAudit.shared.js";

const queueQuestionGatewayAudit = async (
  data: QueueQuestionGatewayAuditInput,
) =>
  questionGatewayAuditQueue.add(
    "QUESTION_ELIGIBILITY_GATE_ACTION_LOG",
    data,
    {
      removeOnComplete: true,
      removeOnFail: false,
      jobId: makeJobId(
        "questionGatewayAudit",
        data.questionId,
        data.version,
        data.decisionId,
      ),
    },
  );

export default queueQuestionGatewayAudit;
