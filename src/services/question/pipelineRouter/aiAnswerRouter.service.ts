import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import AiAnswerGeneration from "../../../models/aiAnswerGeneration.model.js";
import AiAnswer from "../../../models/aiAnswer.model.js";

import aiAnswerPaymentQueue from "../../../queues/aiAnswer/aiAnswerPayment.queue.js";
import aiAnswerPlannerQueue from "../../../queues/aiAnswer/aiAnswerPlanner.queue.js";

type AiAnswerGenerationReason = "INITIAL_AUTO" | "INITIAL_MANUAL";

const aiAnswerRouter = async (generationId: string) => {
  const generation = await AiAnswerGeneration.findById(generationId)
    .select(
      "questionId questionVersion aiAnswerVersion generationReason planningStatus generationPlanId paymentStatus",
    )
    .lean();

  if (!generation)
    throw new Error("AI Answer generation lifecycle record not found");

  const { questionId, questionVersion, aiAnswerVersion } = generation;

  const answerExists = await AiAnswer.exists({
    questionId,
    questionVersion,
    aiAnswerVersion,
  });
  if (answerExists) {
    await AiAnswerGeneration.updateOne(
      { questionId, questionVersion, aiAnswerVersion },
      { $set: { generationStatus: "COMPLETED", status: "COMPLETED" } },
    );
    return;
  }

  const jobData = {
    questionId,
    questionVersion,
    aiAnswerVersion,
    generationReason: generation.generationReason as AiAnswerGenerationReason,
  };

  if (
    generation.planningStatus !== "COMPLETED" ||
    !generation.generationPlanId
  ) {
    await aiAnswerPlannerQueue.add("AI_ANSWER_PLAN", jobData, {
      jobId: makeJobId(
        "aiAnswerPlanner",
        questionId,
        questionVersion,
        aiAnswerVersion,
      ),
      removeOnComplete: true,
      removeOnFail: true,
    });
    return;
  }

  if (generation.paymentStatus === "AUTHORIZED") return;
  if (generation.paymentStatus === "REFUND_PENDING") return;
  if (
    generation.paymentStatus === "BLOCKED_INSUFFICIENT_TOKENS" &&
    generation.generationReason === "INITIAL_MANUAL"
  )
    return;

  await aiAnswerPaymentQueue.add("AI_ANSWER_PAYMENT", jobData, {
    jobId: makeJobId(
      "aiAnswerPayment",
      questionId,
      questionVersion,
      aiAnswerVersion,
    ),
    removeOnComplete: true,
    removeOnFail: true,
  });
};

export default aiAnswerRouter;
