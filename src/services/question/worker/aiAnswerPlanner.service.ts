import llmGateway from "../../llmGateway/llmGateway.service.js";
import withAiAnswerPlannerLock from "./aiAnswerPlanner.lock.js";

import { queueAiAnswerRoute } from "../pipelineRouter/pipelineRouting.service.js";

import AiAnswerGenerationPlan from "../../../models/aiAnswerGenerationPlan.model.js";
import AiAnswerGeneration from "../../../models/aiAnswerGeneration.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";

import { aiAnswerPlannerPrompt } from "../../../prompts/aiAnswer/aiAnswerPlanner.prompt.js";
import {
  createGenerationPlanSchema,
  GenerationPlanSchema,
} from "../../../validations/aiAnswer/generationPlan.schema.js";

type AiAnswerGenerationReason = "INITIAL_AUTO" | "INITIAL_MANUAL";

type AiAnswerPlannerJobData = {
  questionId: string;
  questionVersion: number;
  aiAnswerVersion: number;
  generationReason: AiAnswerGenerationReason;
};

const wakeRouterAfterPlanning = (generationId: string) =>
  queueAiAnswerRoute(generationId, "planned");

const markPlanningCompleted = async (
  jobData: AiAnswerPlannerJobData,
  generationPlanId: unknown,
) => {
  const generation = await AiAnswerGeneration.findOneAndUpdate(
    {
      questionId: jobData.questionId,
      questionVersion: jobData.questionVersion,
      aiAnswerVersion: jobData.aiAnswerVersion,
      planningStatus: "PROCESSING",
    },
    {
      $set: {
        planningStatus: "COMPLETED",
        generationPlanId,
        status: "ACTIVE",
      },
    },
  );

  if (!generation)
    throw new Error("AI Answer generation lifecycle record not found");
};

const processAiAnswerPlannerJob = async (jobData: AiAnswerPlannerJobData) => {
  let claimed = false;
  try {
    await withAiAnswerPlannerLock(jobData, async (assertLockHeld) => {
      const { questionId, questionVersion, aiAnswerVersion, generationReason } =
        jobData;
      const planFilter = { questionId, questionVersion, aiAnswerVersion };

      const claim = await AiAnswerGeneration.findOneAndUpdate(
        {
          ...planFilter,
          planningStatus: { $in: ["NOT_STARTED", "FAILED"] },
        },
        {
          $set: {
            planningStatus: "PROCESSING",
            status: "ACTIVE",
          },
        },
        { returnDocument: "after" },
      );
      if (!claim) {
        const current = await AiAnswerGeneration.findOne(planFilter)
          .select("_id planningStatus")
          .lean();
        if (current?.planningStatus === "COMPLETED")
          await wakeRouterAfterPlanning(String(current._id));
        return;
      }
      claimed = true;

      const existingPlan = await AiAnswerGenerationPlan.findOne({
        ...planFilter,
        generationPlan: { $exists: true },
      })
        .select("_id")
        .lean();
      if (existingPlan) {
        await markPlanningCompleted(jobData, existingPlan._id);
        await wakeRouterAfterPlanning(String(claim._id));
        return;
      }

      const question = await QuestionVersion.findOne({
        questionId,
        version: questionVersion,
      })
        .select("userId title body tags")
        .lean<{
          userId: string;
          title: string;
          body: string;
          tags: string[];
        } | null>();

      if (!question)
        throw new Error("QuestionVersion for AI Answer plan not found");

      const limits = { maxContextTokens: 64000, maxOutputTokens: 8192 };
      const validationSchema = createGenerationPlanSchema(limits);
      const plannerResponse = await llmGateway.generate({
        feature: "aiAnswerPlanner",
        mode: "json",
        schema: validationSchema,
        messages: [
          {
            role: "system",
            content: aiAnswerPlannerPrompt,
            cache: { enabled: true },
          },
          {
            role: "user",
            content: JSON.stringify({
              question,
              generationReason,
              availableModels: ["BASIC", "STANDARD", "ADVANCED", "FRONTIER"],
              availableReasoningEfforts: ["LOW", "MEDIUM", "HIGH"],
              constraints: limits,
            }),
          },
        ],
        temperature: 0,
        maxTokens: 5000,
        structuredOutput: { enabled: true, required: true },
      });

      if (plannerResponse.mode !== "json")
        throw new Error("AI Answer Planner response was not JSON");

      const plannerPlan = validationSchema.parse(plannerResponse.data);
      const { maxContextTokens, maxOutputTokens, ...generationPlanData } =
        plannerPlan;
      const generationPlan = GenerationPlanSchema.parse(generationPlanData);
      await assertLockHeld();

      try {
        const savedPlan = await AiAnswerGenerationPlan.create({
          ...planFilter,
          userId: question.userId,
          generationReason,
          generationPlan,
          metadata: {
            maxContextTokens,
            maxOutputTokens,
            plannerFallbackUsed: plannerResponse.metadata.fallbackUsed,
            provider: plannerResponse.metadata.provider,
            model: plannerResponse.metadata.model,
            latencyMs: plannerResponse.metadata.latencyMs,
            usage: plannerResponse.metadata.usage,
            cost: plannerResponse.metadata.cost,
          },
        });
        await markPlanningCompleted(jobData, savedPlan._id);
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;

        const planWonRace = await AiAnswerGenerationPlan.exists({
          ...planFilter,
          generationPlan: { $exists: true },
        });
        if (!planWonRace) throw error;
        const savedPlan = await AiAnswerGenerationPlan.findOne(planFilter)
          .select("_id")
          .lean();
        if (!savedPlan) throw error;
        await markPlanningCompleted(jobData, savedPlan._id);
      }

      await wakeRouterAfterPlanning(String(claim._id));
    });
  } catch (error) {
    if (claimed)
      await AiAnswerGeneration.updateOne(
        {
          questionId: jobData.questionId,
          questionVersion: jobData.questionVersion,
          aiAnswerVersion: jobData.aiAnswerVersion,
          planningStatus: "PROCESSING",
        },
        {
          $set: {
            planningStatus: "FAILED",
            status: "FAILED",
          },
        },
      );
    throw error;
  }
};

export default processAiAnswerPlannerJob;
