import mongoose from "mongoose";

import Question from "../../../models/question.model.js";

import {
  downstreamAllowedSecurityVerifierStatuses,
  similarQuestionResultLimit,
  similarQuestionScoreThreshold,
} from "./similarQuestions.shared.js";

type SimilarQuestionSearchResult = {
  _id: mongoose.Types.ObjectId;
  score: number;
};

const findSimilarQuestionIds = async ({
  questionId,
  embedding,
  resultLimit = similarQuestionResultLimit,
  scoreThreshold = similarQuestionScoreThreshold,
  numCandidates = 150,
  vectorSearchLimit = 20,
}: {
  questionId: string;
  embedding: number[];
  resultLimit?: number;
  scoreThreshold?: number;
  numCandidates?: number;
  vectorSearchLimit?: number;
}) => {
  const id = new mongoose.Types.ObjectId(questionId);

  const results = await Question.aggregate<SimilarQuestionSearchResult>([
    {
      $vectorSearch: {
        index: "semantic_search_vector_index",
        path: "embedding",
        queryVector: embedding,
        numCandidates,
        limit: vectorSearchLimit,
      },
    },
    {
      $project: {
        _id: 1,
        isActive: 1,
        isDeleted: 1,
        moderationStatus: 1,
        embeddingStatus: 1,
        questionEligibilityStatus: 1,
        securityVerifierStatus: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      $match: {
        _id: { $ne: id },
        isActive: true,
        isDeleted: false,
        moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
        embeddingStatus: "READY",
        questionEligibilityStatus: "ALLOWED",
        securityVerifierStatus: {
          $in: downstreamAllowedSecurityVerifierStatuses,
        },
      },
    },
  ]);

  return results
    .filter((result) => result.score >= scoreThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, resultLimit)
    .map((result) => result._id);
};

export default findSimilarQuestionIds;
