import crypto from "node:crypto";

import type { GenerationPlan } from "../../../../validations/question/aiAnswer/generationPlan.schema.js";

import aiAnswerRetrievalLimits from "../../../../config/aiAnswerRetrieval.config.js";

import AiAnswerGeneration from "../../../../models/aiAnswerGeneration.model.js";
import AiAnswerGenerationPlan from "../../../../models/aiAnswerGenerationPlan.model.js";

import { GenerationPlanSchema } from "../../../../validations/question/aiAnswer/generationPlan.schema.js";

type RetrievalSourceType = GenerationPlan["retrievalSources"][number]["type"];

const beginRetrievalCall = async ({
  generationId,
  sourceType,
  evidenceTokenLimit,
}: {
  generationId: string;
  sourceType: RetrievalSourceType;
  evidenceTokenLimit: number;
}) => {
  if (!Number.isSafeInteger(evidenceTokenLimit) || evidenceTokenLimit <= 0)
    throw new Error("Invalid retrieval evidence token limit");

  const generation = await AiAnswerGeneration.findById(generationId)
    .select("generationPlanId paymentStatus generationStatus status")
    .lean();

  if (!generation?.generationPlanId)
    throw new Error("AI Answer generation plan not found");

  if (
    generation.paymentStatus !== "AUTHORIZED" ||
    generation.generationStatus !== "PROCESSING" ||
    generation.status !== "ACTIVE"
  )
    throw new Error("AI Answer generation is not authorized for retrieval");

  const planDocument = await AiAnswerGenerationPlan.findById(
    generation.generationPlanId,
  )
    .select("generationPlan")
    .lean();

  if (!planDocument) throw new Error("Persisted AI Answer plan not found");

  const plan = GenerationPlanSchema.parse(planDocument.generationPlan);
  const source = plan.retrievalSources.find(({ type }) => type === sourceType);

  if (!source)
    throw new Error(`Retrieval source ${sourceType} is not authorized`);

  const sourceLimits = aiAnswerRetrievalLimits.sources[sourceType];
  const sourceField = `retrievalUsage.sources.${sourceType}`;
  const callId = crypto.randomUUID();

  const totalCalls = { $ifNull: ["$retrievalUsage.totalCalls", 0] };
  const sourceCalls = { $ifNull: [`$${sourceField}.calls`, 0] };
  const totalEvidenceTokens = {
    $ifNull: ["$retrievalUsage.totalEvidenceTokens", 0],
  };
  const sourceEvidenceTokens = {
    $ifNull: [`$${sourceField}.evidenceTokens`, 0],
  };

  const started = await AiAnswerGeneration.findOneAndUpdate(
    {
      _id: generation._id,
      generationPlanId: generation.generationPlanId,
      paymentStatus: "AUTHORIZED",
      generationStatus: "PROCESSING",
      status: "ACTIVE",
      "retrievalUsage.activeCallId": { $exists: false },
      $expr: {
        $and: [
          {
            $lt: [
              totalCalls,
              Math.min(
                plan.maxTotalToolCalls,
                aiAnswerRetrievalLimits.maxTotalToolCalls,
              ),
            ],
          },
          {
            $lt: [
              sourceCalls,
              Math.min(source.maxCalls, sourceLimits.maxCalls),
            ],
          },
          {
            $lte: [
              { $add: [totalEvidenceTokens, evidenceTokenLimit] },
              Math.min(
                plan.maxTotalEvidenceTokens,
                aiAnswerRetrievalLimits.maxTotalEvidenceTokens,
              ),
            ],
          },
          {
            $lte: [
              { $add: [sourceEvidenceTokens, evidenceTokenLimit] },
              Math.min(
                source.maxEvidenceTokens,
                sourceLimits.maxEvidenceTokens,
              ),
            ],
          },
        ],
      },
    },
    {
      $inc: {
        "retrievalUsage.totalCalls": 1,
        [`${sourceField}.calls`]: 1,
      },
      $set: {
        "retrievalUsage.activeCallId": callId,
        "retrievalUsage.activeSourceType": sourceType,
        "retrievalUsage.activeEvidenceTokenLimit": evidenceTokenLimit,
      },
    },
    { returnDocument: "after" },
  )
    .select("_id")
    .lean();

  if (!started)
    throw new Error("Retrieval limit reached or another call is in progress");

  return { callId, evidenceTokenLimit };
};

const completeRetrievalCall = async ({
  generationId,
  callId,
  sourceType,
  evidenceTokens,
}: {
  generationId: string;
  callId: string;
  sourceType: RetrievalSourceType;
  evidenceTokens: number;
}) => {
  if (!Number.isSafeInteger(evidenceTokens) || evidenceTokens < 0)
    throw new Error("Invalid retrieval evidence token count");

  if (
    !Object.prototype.hasOwnProperty.call(
      aiAnswerRetrievalLimits.sources,
      sourceType,
    )
  )
    throw new Error("Invalid retrieval source type");

  const sourceField = `retrievalUsage.sources.${sourceType}`;

  const completed = await AiAnswerGeneration.updateOne(
    {
      _id: generationId,
      "retrievalUsage.activeCallId": callId,
      "retrievalUsage.activeSourceType": sourceType,
      $expr: {
        $gte: ["$retrievalUsage.activeEvidenceTokenLimit", evidenceTokens],
      },
    },
    {
      $inc: {
        "retrievalUsage.totalEvidenceTokens": evidenceTokens,
        [`${sourceField}.evidenceTokens`]: evidenceTokens,
      },
      $unset: {
        "retrievalUsage.activeCallId": "",
        "retrievalUsage.activeSourceType": "",
        "retrievalUsage.activeEvidenceTokenLimit": "",
      },
    },
  );

  if (!completed.modifiedCount)
    throw new Error("Retrieval call not active or evidence exceeds its limit");
};

export { beginRetrievalCall, completeRetrievalCall };
export type { RetrievalSourceType };
