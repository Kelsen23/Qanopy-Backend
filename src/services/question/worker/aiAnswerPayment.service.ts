import type {
  GenerationPlan,
  GenerationPlanMetadata,
} from "../../../validations/aiAnswer/generationPlan.schema.js";

import calculateCreditCharge, {
  AI_ANSWER_PRICING_POLICY,
} from "../../user/credits/calculateCreditCharge.service.js";
import chargeCredits from "../../user/credits/chargeCredits.service.js";
import makeCreditOperationKey from "../../user/credits/creditOperationKey.shared.js";
import routeNotification from "../../notification/routeNotification.service.js";
import { queueAiAnswerRoute } from "../pipelineRouter/pipelineRouting.service.js";

import prisma from "../../../config/prisma.config.js";

import HttpError from "../../../utils/http/httpError.util.js";

import AiAnswerGeneration from "../../../models/aiAnswerGeneration.model.js";
import AiAnswerGenerationPlan from "../../../models/aiAnswerGenerationPlan.model.js";
import AiAnswer from "../../../models/aiAnswer.model.js";

type AiAnswerPaymentJobData = {
  questionId: string;
  questionVersion: number;
  aiAnswerVersion: number;
};

const processAiAnswerPayment = async ({
  questionId,
  questionVersion,
  aiAnswerVersion,
}: AiAnswerPaymentJobData) => {
  const generation = await AiAnswerGeneration.findOne({
    questionId,
    questionVersion,
    aiAnswerVersion,
  });

  if (!generation)
    throw new Error("AI Answer generation lifecycle record not found");
  if (typeof generation.userId !== "string")
    throw new Error("AI Answer generation owner not found");
  if (generation.generationReason === "FEEDBACK_REFINEMENT")
    throw new Error("Feedback refinement payment not supported");

  const operationKey = makeCreditOperationKey({
    type: "AI_ANSWER",
    userId: generation.userId,
    questionId: String(generation.questionId),
    version: Number(generation.questionVersion),
  });
  let existingOperation = await prisma.creditOperation.findUnique({
    where: { operationKey },
  });
  if (!existingOperation) {
    const previousOperation = await prisma.creditOperation.findUnique({
      where: { operationKey: `ai-answer-generation:${generation._id}` },
    });
    if (previousOperation) {
      existingOperation = await prisma.creditOperation.update({
        where: { id: previousOperation.id },
        data: { operationKey, reason: null },
      });
    }
  }
  if (existingOperation?.status === "CHARGED") {
    if (
      existingOperation.userId !== generation.userId ||
      existingOperation.type !== "AI_ANSWER"
    ) {
      throw new Error("AI Answer payment operation identity mismatch");
    }

    await AiAnswerGeneration.updateOne(
      { _id: generation._id },
      {
        $set: {
          paymentStatus: "AUTHORIZED",
          status: "ACTIVE",
          paymentOperationId: existingOperation.id,
          reservedAmount: existingOperation.chargeAmount,
        },
      },
    );

    await wakePipelineRouter(String(generation._id));
    return;
  }

  if (existingOperation?.status === "REFUND_PENDING") {
    await AiAnswerGeneration.updateOne(
      { _id: generation._id, paymentStatus: { $ne: "AUTHORIZED" } },
      { $set: { paymentStatus: "REFUND_PENDING" } },
    );
    return;
  }

  const completedAnswer = await AiAnswer.exists({
    questionId,
    questionVersion,
    aiAnswerVersion,
  });
  if (completedAnswer) {
    await AiAnswerGeneration.updateOne(
      { _id: generation._id },
      { $set: { generationStatus: "COMPLETED", status: "COMPLETED" } },
    );
    return;
  }

  if (generation.paymentStatus === "AUTHORIZED") return;
  if (generation.planningStatus !== "COMPLETED" || !generation.generationPlanId)
    throw new Error("AI Answer generation plan not complete");

  const planDocument = await AiAnswerGenerationPlan.findById(
    generation.generationPlanId,
  )
    .select("generationPlan metadata")
    .lean();
  if (!planDocument) throw new Error("Persisted AI Answer plan not found");

  const plan = planDocument.generationPlan as GenerationPlan;
  const amount = await calculateCreditCharge({
    type: "AI_ANSWER",
    plan,
    metadata: planDocument.metadata as GenerationPlanMetadata,
  });
  const planCharge = {
    amount,
    pricingPolicyVersion: AI_ANSWER_PRICING_POLICY.version,
  };
  const processingGeneration = await AiAnswerGeneration.findOneAndUpdate(
    {
      _id: generation._id,
      paymentStatus: {
        $in: [
          "NOT_STARTED",
          "BLOCKED_INSUFFICIENT_TOKENS",
          "FAILED",
          "RETRY_QUEUED",
        ],
      },
    },
    {
      $set: {
        paymentStatus: "PROCESSING",
        status: "ACTIVE",
        reservedAmount: planCharge.amount,
        pricingPolicyVersion: planCharge.pricingPolicyVersion,
      },
      $inc: { paymentAttemptCount: 1 },
    },
    { returnDocument: "after" },
  );
  if (!processingGeneration) return;

  try {
    const charge = await chargeCredits({
      userId: generation.userId,
      operationKey,
      type: "AI_ANSWER",
      amount: planCharge.amount,
    });

    await AiAnswerGeneration.updateOne(
      {
        _id: generation._id,
        paymentStatus: "PROCESSING",
        paymentAttemptCount: processingGeneration.paymentAttemptCount,
      },
      {
        $set: {
          paymentStatus: "AUTHORIZED",
          status: "ACTIVE",
          paymentOperationId: charge.operationId,
        },
      },
    );
  } catch (error) {
    if (error instanceof HttpError && error.message === "Not enough credits") {
      const blocked = await AiAnswerGeneration.updateOne(
        {
          _id: generation._id,
          paymentStatus: "PROCESSING",
          paymentAttemptCount: processingGeneration.paymentAttemptCount,
        },
        {
          $set: {
            paymentStatus: "BLOCKED_INSUFFICIENT_TOKENS",
            status: "BLOCKED",
          },
        },
      );

      if (blocked.modifiedCount > 0) {
        await routeNotification({
          recipientId: generation.userId,
          event: "AI_ANSWER_PAYMENT_BLOCKED",
          target: {
            entityType: "QUESTION",
            entityId: questionId,
            questionVersion,
          },
          meta: {
            generationId: String(generation._id),
            aiAnswerVersion,
            paymentAttempt: processingGeneration.paymentAttemptCount,
            idempotencyKey: `${generation._id}:${processingGeneration.paymentAttemptCount}`,
            amount: planCharge.amount,
          },
        });
      }

      return;
    }

    await AiAnswerGeneration.updateOne(
      {
        _id: generation._id,
        paymentStatus: "PROCESSING",
        paymentAttemptCount: processingGeneration.paymentAttemptCount,
      },
      {
        $set: {
          paymentStatus: "FAILED",
          status: "FAILED",
        },
      },
    );

    throw error;
  }

  await wakePipelineRouter(String(generation._id));
};

const wakePipelineRouter = (generationId: string) =>
  queueAiAnswerRoute(generationId, "payment-authorized");

export default processAiAnswerPayment;
