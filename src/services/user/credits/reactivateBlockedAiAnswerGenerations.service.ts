import {
  GenerationPlanMetadataSchema,
  GenerationPlanSchema,
} from "../../../validations/question/aiAnswer/generationPlan.schema.js";

import { calculateAIAnswerPlanCharge } from "./calculateCreditCharge.service.js";
import hasCreditCapacity from "./hasCreditCapacity.service.js";

import { queueAiAnswerRoute } from "../../question/pipelineRouter/pipelineRouting.service.js";

import AiAnswerGeneration from "../../../models/aiAnswerGeneration.model.js";
import AiAnswerGenerationPlan from "../../../models/aiAnswerGenerationPlan.model.js";
import Question from "../../../models/question.model.js";

const reactivateBlockedAiAnswerGenerations = async (userId: string) => {
  const generations = await AiAnswerGeneration.find({
    userId,
    generationReason: "INITIAL_AUTO",
    paymentStatus: "BLOCKED_INSUFFICIENT_TOKENS",
  })
    .select(
      "_id questionId questionVersion aiAnswerVersion generationPlanId reservedAmount",
    )
    .lean();

  for (const generation of generations) {
    const question = await Question.findOne({
      _id: generation.questionId,
      userId,
      currentVersion: generation.questionVersion,
      isActive: true,
      isDeleted: false,
    })
      .select("_id")
      .lean();

    if (!question) continue;

    if (!generation.generationPlanId) continue;

    const plan = await AiAnswerGenerationPlan.findById(
      generation.generationPlanId,
    )
      .select("generationPlan metadata")
      .lean();

    if (!plan) continue;

    const amount =
      generation.reservedAmount ??
      calculateAIAnswerPlanCharge(
        GenerationPlanSchema.parse(plan.generationPlan),
        GenerationPlanMetadataSchema.parse(plan.metadata),
      ).amount;

    if (!(await hasCreditCapacity(userId, amount))) continue;

    await queueAiAnswerRoute(String(generation._id), "quota-increased");
  }
};

export default reactivateBlockedAiAnswerGenerations;
