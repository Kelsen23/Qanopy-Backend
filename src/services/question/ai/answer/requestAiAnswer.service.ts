import loadAiAnswerRequestEligibility from "./aiAnswerRequestEligibility.service.js";
import withAiAnswerRequestLock from "./aiAnswerRequest.lock.js";
import { queueAiAnswerRoute } from "../../pipelineRouter/pipelineRouting.service.js";

import HttpError from "../../../../utils/http/httpError.util.js";

import AiAnswerGeneration from "../../../../models/aiAnswerGeneration.model.js";
import AiAnswer from "../../../../models/aiAnswer.model.js";

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
      generationReason === "INITIAL_MANUAL" &&
      eligibility.aiAnswerAutoGeneration
    ) {
      throw new HttpError(
        "Manual AI answer generation is unavailable while auto-generation is enabled",
        409,
      );
    }

    const aiAnswerVersion = 1;
    const existingAnswer = await AiAnswer.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
    })
      .select("_id")
      .lean();
    if (existingAnswer) return { status: "ALREADY_ANSWERED" as const };

    let generation = await AiAnswerGeneration.findOne({
      questionId,
      questionVersion,
      aiAnswerVersion,
    });

    if (generation) {
      if (generation.status === "COMPLETED")
        return { status: "ALREADY_ANSWERED" as const };
      if (generation.paymentStatus === "BLOCKED_INSUFFICIENT_TOKENS")
        return { status: "BLOCKED_INSUFFICIENT_TOKENS" as const };

      await assertLockHeld();
      await queueAiAnswerRoute(String(generation._id), "REQUEST_WAKEUP");
      return {
        status: "IN_PROGRESS" as const,
        generationReason: generation.generationReason,
      };
    }

    if (
      generationReason === "INITIAL_AUTO" &&
      !eligibility.aiAnswerAutoGeneration
    )
      return { status: "AUTO_GENERATION_DISABLED" as const };

    if (!eligibility.isReady) {
      if (generationReason === "INITIAL_MANUAL")
        throw new HttpError("Question is not eligible for AI answer", 400);
      return { status: "NOT_ELIGIBLE" as const };
    }

    let generationAlreadyExisted = false;

    await assertLockHeld();
    try {
      generation = await AiAnswerGeneration.findOneAndUpdate(
        { questionId, questionVersion, aiAnswerVersion },
        {
          $setOnInsert: {
            questionId,
            userId: eligibility.question.userId,
            questionVersion,
            aiAnswerVersion,
            generationReason,
            planningStatus: "NOT_STARTED",
            paymentStatus: "NOT_STARTED",
            status: "ACTIVE",
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      generation = await AiAnswerGeneration.findOne({
        questionId,
        questionVersion,
        aiAnswerVersion,
      });
      if (!generation) throw error;
      generationAlreadyExisted = true;
      if (generation.paymentStatus === "BLOCKED_INSUFFICIENT_TOKENS")
        return { status: "BLOCKED_INSUFFICIENT_TOKENS" as const };
      if (generation.status === "COMPLETED")
        return { status: "ALREADY_ANSWERED" as const };
    }
    if (!generation) throw new Error("Failed to create AI Answer generation");
    await queueAiAnswerRoute(String(generation._id));

    return generationAlreadyExisted
      ? {
          status: "IN_PROGRESS" as const,
          generationReason: generation.generationReason,
        }
      : {
          status: "REQUESTED" as const,
          generationReason,
        };
  });
};

export default requestAiAnswer;
