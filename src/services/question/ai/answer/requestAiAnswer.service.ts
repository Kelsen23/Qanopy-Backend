import type { Queue } from "bullmq";

import loadAiAnswerRequestEligibility from "./aiAnswerRequestEligibility.service.js";
import withAiAnswerRequestLock from "./aiAnswerRequest.lock.js";

import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import AiAnswerGenerationPlan from "../../../../models/aiAnswerGenerationPlan.model.js";
import AiAnswer from "../../../../models/aiAnswer.model.js";

import aiAnswerPipelineRouterQueue from "../../../../queues/aiAnswer/aiAnswerPipelineRouter.queue.js";
import aiAnswerPlannerQueue from "../../../../queues/aiAnswer/aiAnswerPlanner.queue.js";

type AiAnswerGenerationReason = "INITIAL_AUTO" | "INITIAL_MANUAL";
type AiAnswerRequestInput =
  | {
      questionId: string;
      questionVersion: number;
      generationReason: "INITIAL_AUTO";
    }
  | {
      questionId: string;
      questionVersion: number;
      generationReason: "INITIAL_MANUAL";
      requestedByUserId: string;
    };

const activeQueueStates = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

const inspectQueueJob = async (queue: Queue, jobId: string) => {
  const job = await queue.getJob(jobId);
  if (!job) return { active: false, generationReason: undefined };

  const state = await job.getState();
  if (activeQueueStates.has(state)) {
    return {
      active: true,
      generationReason: job.data?.generationReason as
        | AiAnswerGenerationReason
        | undefined,
    };
  }

  try {
    await job.remove();
  } catch {
    const currentJob = await queue.getJob(jobId);
    if (currentJob) {
      const currentState = await currentJob.getState();
      if (activeQueueStates.has(currentState))
        return {
          active: true,
          generationReason: currentJob.data?.generationReason as
            | AiAnswerGenerationReason
            | undefined,
        };
    }
  }
  return { active: false, generationReason: undefined };
};

const requestAiAnswer = async ({
  questionId,
  questionVersion,
  generationReason,
  ...requestMetadata
}: AiAnswerRequestInput) => {
  const requestedByUserId =
    "requestedByUserId" in requestMetadata
      ? requestMetadata.requestedByUserId
      : undefined;
  return withAiAnswerRequestLock(questionId, async (assertLockHeld) => {
    const eligibility = await loadAiAnswerRequestEligibility(
      questionId,
      questionVersion,
    );

    if (!eligibility.question) {
      if (generationReason === "INITIAL_MANUAL")
        throw new HttpError("Question not found", 404);
      return { status: "NOT_ELIGIBLE" as const };
    }

    if (requestedByUserId && eligibility.question.userId !== requestedByUserId)
      throw new HttpError("Unauthorized to generate AI answer", 403);

    if (!eligibility.questionIsCurrentAndActive) {
      if (generationReason === "INITIAL_MANUAL") {
        if (eligibility.question.isDeleted || !eligibility.question.isActive)
          throw new HttpError("Question not active", 410);
        throw new HttpError(
          `Stale version. Current version is ${eligibility.question.currentVersion}`,
          409,
        );
      }
      return { status: "NOT_ELIGIBLE" as const };
    }

    if (
      generationReason === "INITIAL_AUTO" &&
      !eligibility.aiAnswerAutoGeneration
    ) {
      return { status: "AUTO_GENERATION_DISABLED" as const };
    }

    if (
      generationReason === "INITIAL_MANUAL" &&
      eligibility.aiAnswerAutoGeneration
    ) {
      throw new HttpError(
        "Manual AI answer generation is unavailable while auto-generation is enabled",
        409,
      );
    }

    if (!eligibility.isReady) {
      if (generationReason === "INITIAL_MANUAL")
        throw new HttpError("Question is not eligible for AI answer", 400);
      return { status: "NOT_ELIGIBLE" as const };
    }

    const aiAnswerVersion = 1;
    const generationIdentity = [questionId, questionVersion, aiAnswerVersion];

    const existingAnswer = await AiAnswer.findOne({
      questionId,
      questionVersion,
    })
      .select("_id")
      .lean();
    if (existingAnswer) return { status: "ALREADY_EXISTS" as const };

    const existingPlan = await AiAnswerGenerationPlan.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
      generationPlan: { $exists: true },
    })
      .select("_id generationReason")
      .lean();
    if (existingPlan)
      return {
        status: "PLAN_EXISTS" as const,
        generationReason: existingPlan.generationReason,
      };

    const routerJobId = makeJobId(
      "aiAnswerPipelineRouter",
      ...generationIdentity,
    );
    const plannerJobId = makeJobId("aiAnswerPlanner", ...generationIdentity);
    const plannerJob = await inspectQueueJob(
      aiAnswerPlannerQueue,
      plannerJobId,
    );
    if (plannerJob.active) {
      return {
        status: "ALREADY_QUEUED" as const,
        generationReason: plannerJob.generationReason ?? generationReason,
      };
    }

    const routerJob = await inspectQueueJob(
      aiAnswerPipelineRouterQueue,
      routerJobId,
    );
    if (routerJob.active) {
      return {
        status: "ALREADY_QUEUED" as const,
        generationReason: routerJob.generationReason ?? generationReason,
      };
    }

    await assertLockHeld();
    await aiAnswerPipelineRouterQueue.add(
      "AI_ANSWER_PIPELINE_ROUTE",
      { questionId, questionVersion, aiAnswerVersion, generationReason },
      {
        jobId: routerJobId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    const savedPlan = await AiAnswerGenerationPlan.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
      generationPlan: { $exists: true },
    })
      .select("generationReason")
      .lean();
    if (savedPlan) {
      return {
        status: "PLAN_EXISTS" as const,
        generationReason: savedPlan.generationReason,
      };
    }

    const [queuedPlannerJob, queuedRouterJob] = await Promise.all([
      inspectQueueJob(aiAnswerPlannerQueue, plannerJobId),
      inspectQueueJob(aiAnswerPipelineRouterQueue, routerJobId),
    ]);
    const acceptedGenerationReason =
      queuedPlannerJob.generationReason ??
      queuedRouterJob.generationReason ??
      generationReason;

    const completedPlan = await AiAnswerGenerationPlan.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
      generationPlan: { $exists: true },
    })
      .select("generationReason")
      .lean();
    if (completedPlan) {
      return {
        status: "PLAN_EXISTS" as const,
        generationReason: completedPlan.generationReason,
      };
    }

    return {
      status: "REQUESTED" as const,
      jobId: routerJobId,
      generationReason: acceptedGenerationReason,
    };
  });
};

export default requestAiAnswer;
