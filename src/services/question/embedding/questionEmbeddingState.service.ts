import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";

import { downstreamAllowedSecurityVerifierStatuses } from "./questionEmbedding.shared.js";

type LockedEmbeddingQuestion = {
  _id: unknown;
  userId: unknown;
  embedding?: number[] | null;
  embeddingHash?: string | null;
};

type EmbeddingQuestionVersion = {
  title: string;
  body: string;
  tags: string[];
};

const lockQuestionForEmbedding = async (questionId: string, version: number) =>
  Question.findOneAndUpdate(
    {
      _id: questionId,
      currentVersion: version,
      isActive: true,
      isDeleted: false,
      moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      questionEligibilityStatus: "ALLOWED",
      securityVerifierStatus: {
        $in: downstreamAllowedSecurityVerifierStatuses,
      },
      embeddingStatus: "NONE",
    },
    { $set: { embeddingStatus: "PROCESSING" } },
    { returnDocument: "after" },
  ).lean<LockedEmbeddingQuestion>();

const loadCurrentQuestionVersionForEmbedding = async (
  questionId: string,
  version: number,
) =>
  QuestionVersion.findOne({
    questionId,
    version,
    isActive: true,
    moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
  })
    .select("title body tags")
    .lean<EmbeddingQuestionVersion>();

const resetQuestionEmbeddingProcessing = async (
  questionId: string,
  version: number,
) =>
  Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      embeddingStatus: "PROCESSING",
    },
    { $set: { embeddingStatus: "NONE" } },
  );

const finalizeQuestionEmbedding = async ({
  questionId,
  version,
  embedding,
  embeddingHash,
}: {
  questionId: string;
  version: number;
  embedding: number[];
  embeddingHash: string;
}) =>
  Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      embeddingStatus: "PROCESSING",
    },
    {
      $set: {
        embedding,
        embeddingHash,
        embeddingStatus: "READY",
        similarQuestionsStatus: "NONE",
      },
    },
  );

const loadReadyQuestionForEmbeddingSideEffects = async (
  questionId: string,
  version: number,
) =>
  Question.findOne({
    _id: questionId,
    currentVersion: version,
    isActive: true,
    isDeleted: false,
    moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
    questionEligibilityStatus: "ALLOWED",
    securityVerifierStatus: {
      $in: downstreamAllowedSecurityVerifierStatuses,
    },
    embeddingStatus: "READY",
  })
    .select("userId")
    .lean<{ userId: unknown }>();

export {
  finalizeQuestionEmbedding,
  loadCurrentQuestionVersionForEmbedding,
  loadReadyQuestionForEmbeddingSideEffects,
  lockQuestionForEmbedding,
  resetQuestionEmbeddingProcessing,
  type LockedEmbeddingQuestion,
};
