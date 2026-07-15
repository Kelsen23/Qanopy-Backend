import mongoose from "mongoose";

import Question from "../../../models/question.model.js";

import { downstreamAllowedSecurityVerifierStatuses } from "./similarQuestions.shared.js";

type LockedSimilarQuestionsQuestion = {
  _id: unknown;
  userId: unknown;
  embedding?: number[] | null;
};

const lockQuestionForSimilarQuestions = async (
  questionId: string,
  version: number,
) =>
  Question.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(questionId),
      currentVersion: version,
      isActive: true,
      isDeleted: false,
      moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      questionEligibilityStatus: "ALLOWED",
      securityVerifierStatus: {
        $in: downstreamAllowedSecurityVerifierStatuses,
      },
      embeddingStatus: "READY",
      similarQuestionsStatus: "NONE",
    },
    { $set: { similarQuestionsStatus: "PROCESSING" } },
    { returnDocument: "after" },
  ).lean<LockedSimilarQuestionsQuestion>();

const resetSimilarQuestionsProcessing = async (
  questionId: string,
  version: number,
) =>
  Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      similarQuestionsStatus: "PROCESSING",
    },
    { $set: { similarQuestionsStatus: "NONE" } },
  );

const finalizeSimilarQuestions = async ({
  questionId,
  version,
  similarQuestionIds,
}: {
  questionId: string;
  version: number;
  similarQuestionIds: mongoose.Types.ObjectId[];
}) =>
  Question.updateOne(
    {
      _id: questionId,
      currentVersion: version,
      similarQuestionsStatus: "PROCESSING",
    },
    {
      $set: {
        similarQuestionIds,
        similarQuestionsStatus: "READY",
      },
    },
  );

const loadReadyQuestionForSimilarSideEffects = async (
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
    similarQuestionsStatus: "READY",
  })
    .select("userId similarQuestionIds")
    .lean<{
      userId: unknown;
      similarQuestionIds: mongoose.Types.ObjectId[];
    }>();

export {
  finalizeSimilarQuestions,
  loadReadyQuestionForSimilarSideEffects,
  lockQuestionForSimilarQuestions,
  resetSimilarQuestionsProcessing,
  type LockedSimilarQuestionsQuestion,
};
