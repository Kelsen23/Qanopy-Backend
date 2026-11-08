import { queueQuestionPipelineStep } from "../pipelineRouter/pipelineRouting.service.js";
import { eligibleQuestionProcessingStateMatch } from "./similarQuestions.shared.js";
import { updateQuestionProcessingState } from "../processingState/questionProcessingState.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import { clearQuestionDiscoveryCache } from "../../../utils/cache/clearCache.util.js";

import Question from "../../../models/question.model.js";
import QuestionProcessingState from "../../../models/questionProcessingState.model.js";

const similarQuestionsFreshnessMs = 12 * 60 * 60 * 1000;
const similarQuestionsSchedulerBatchSize = 100;

const discoverStaleSimilarQuestions = async (now = new Date()) => {
  const staleBefore = new Date(now.getTime() - similarQuestionsFreshnessMs);

  return QuestionProcessingState.aggregate<{
    questionId: unknown;
    questionVersion: number;
    similarQuestionsStatus: "NOT_STARTED" | "PENDING" | "READY";
  }>([
    {
      $match: {
        ...eligibleQuestionProcessingStateMatch,
        $and: [
          { similarQuestionsStatus: { $ne: "PROCESSING" } },
          {
            $or: [
              {
                $expr: {
                  $ne: ["$similarQuestionsComputedVersion", "$questionVersion"],
                },
              },
              { similarQuestionsComputedAt: null },
              { similarQuestionsComputedAt: { $lt: staleBefore } },
              {
                similarQuestionsStatus: {
                  $in: ["NOT_STARTED", "PENDING"],
                },
              },
            ],
          },
        ],
      },
    },
    { $sort: { similarQuestionsComputedAt: 1, questionId: 1 } },
    {
      $lookup: {
        from: Question.collection.name,
        let: { questionId: "$questionId", version: "$questionVersion" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$questionId"] },
                  { $eq: ["$currentVersion", "$$version"] },
                  { $eq: ["$isActive", true] },
                  { $eq: ["$isDeleted", false] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "question",
      },
    },
    { $unwind: "$question" },
    { $limit: similarQuestionsSchedulerBatchSize },
    {
      $project: {
        _id: 0,
        questionId: 1,
        questionVersion: 1,
        similarQuestionsStatus: 1,
      },
    },
  ]);
};

const scheduleStaleSimilarQuestions = async () => {
  const staleQuestions = await discoverStaleSimilarQuestions();
  let queued = 0;
  let invalidatedCachedReadiness = false;

  try {
    for (const question of staleQuestions) {
      const questionId = String(question.questionId);
      const claim = await updateQuestionProcessingState({
        questionId: question.questionId,
        questionVersion: question.questionVersion,
        match: {
          ...eligibleQuestionProcessingStateMatch,
          similarQuestionsStatus: { $in: ["NOT_STARTED", "READY"] },
        },
        set: {
          similarQuestionsStatus: "PENDING",
          similarQuestionsComputedVersion: null,
        },
      });

      if (
        claim.matchedCount === 0 &&
        question.similarQuestionsStatus !== "PENDING"
      ) {
        continue;
      }

      if (
        claim.matchedCount > 0 &&
        question.similarQuestionsStatus === "READY"
      ) {
        await getRedisCacheClient().del(`question:${questionId}`);
        invalidatedCachedReadiness = true;
      }

      try {
        await queueQuestionPipelineStep({
          questionId,
          version: question.questionVersion,
          step: "SIMILAR",
          refresh: true,
        });
        queued += 1;
      } catch (error) {
        if (claim.matchedCount > 0) {
          await updateQuestionProcessingState({
            questionId: question.questionId,
            questionVersion: question.questionVersion,
            match: {
              similarQuestionsStatus: "PENDING",
            },
            set: { similarQuestionsStatus: "NOT_STARTED" },
          });
        }

        throw error;
      }
    }
  } finally {
    if (invalidatedCachedReadiness) await clearQuestionDiscoveryCache();
  }

  return { discovered: staleQuestions.length, queued };
};

export {
  discoverStaleSimilarQuestions,
  scheduleStaleSimilarQuestions,
  similarQuestionsFreshnessMs,
  similarQuestionsSchedulerBatchSize,
};
