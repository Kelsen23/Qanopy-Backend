import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import AiAnswerGenerationPlan from "../../../../models/aiAnswerGenerationPlan.model.js";
import aiAnswerPlannerQueue from "../../../../queues/aiAnswer/aiAnswerPlanner.queue.js";

type AiAnswerGenerationReason = "INITIAL_AUTO" | "INITIAL_MANUAL";

const routeAiAnswerGeneration = async ({
  questionId,
  questionVersion,
  aiAnswerVersion,
  generationReason,
}: {
  questionId: string;
  questionVersion: number;
  aiAnswerVersion: number;
  generationReason: AiAnswerGenerationReason;
}) => {
  const generationPlan = await AiAnswerGenerationPlan.findOne({
    questionId,
    questionVersion,
    aiAnswerVersion,
    generationPlan: { $exists: true },
  })
    .select("_id")
    .lean();

  if (generationPlan) return;

  await aiAnswerPlannerQueue.add(
    "AI_ANSWER_PLAN",
    { questionId, questionVersion, aiAnswerVersion, generationReason },
    {
      jobId: makeJobId(
        "aiAnswerPlanner",
        questionId,
        questionVersion,
        aiAnswerVersion,
      ),
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
};

export default routeAiAnswerGeneration;
