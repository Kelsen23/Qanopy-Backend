import mongoose from "mongoose";

import {
  denseRepresentationVersion,
  downstreamAllowedSecurityVerifierStatuses,
} from "./questionEmbedding.shared.js";
import {
  findOneAndUpdateQuestionProcessingState,
  updateQuestionProcessingState,
} from "../../processingState/questionProcessingState.service.js";
import Question from "../../../../models/question.model.js";
import QuestionVersion from "../../../../models/questionVersion.model.js";
import QuestionEmbedding from "../../../../models/questionEmbedding.model.js";
import QuestionProcessingState from "../../../../models/questionProcessingState.model.js";

type LockedEmbeddingQuestion = {
  _id: unknown;
  userId: unknown;
};

type EmbeddingQuestionVersion = {
  userId: unknown;
  title: string;
  body: string;
  tags: string[];
};

const lockQuestionForEmbedding = async (questionId: string, version: number) =>
  findOneAndUpdateQuestionProcessingState({
    questionId,
    questionVersion: version,
    match: {
      moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
      questionEligibilityStatus: "ALLOWED",
      securityVerifierStatus: {
        $in: downstreamAllowedSecurityVerifierStatuses,
      },
      embeddingStatus: "NOT_STARTED",
    },
    set: { embeddingStatus: "PROCESSING" },
  });

const loadCurrentQuestionVersionForEmbedding = async (
  questionId: string,
  version: number,
) => {
  const [question, questionVersion] = await Promise.all([
    Question.findOne({
      _id: questionId,
      currentVersion: version,
      isActive: true,
      isDeleted: false,
    })
      .select("userId")
      .lean<{ userId: unknown }>(),
    QuestionVersion.findOne({
      questionId,
      version,
      isActive: true,
      moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
    })
      .select("title body tags")
      .lean<Omit<EmbeddingQuestionVersion, "userId">>(),
  ]);

  return question && questionVersion
    ? { ...questionVersion, userId: question.userId }
    : null;
};

const resetQuestionEmbeddingProcessing = async (
  questionId: string,
  version: number,
) =>
  updateQuestionProcessingState({
    questionId,
    questionVersion: version,
    match: {
      embeddingStatus: "PROCESSING",
    },
    set: { embeddingStatus: "NOT_STARTED" },
  });

const finalizeQuestionEmbedding = async ({
  questionId,
  version,
  embedding,
  model,
}: {
  questionId: string;
  version: number;
  embedding: number[];
  model: string;
}) => {
  const session = await mongoose.startSession();
  let questionUpdated = false;

  try {
    const embeddingResult = await session.withTransaction(async () => {
      const questionUpdate = await updateQuestionProcessingState({
        questionId,
        questionVersion: version,
        match: {
          moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
          questionEligibilityStatus: "ALLOWED",
          securityVerifierStatus: {
            $in: downstreamAllowedSecurityVerifierStatuses,
          },
          embeddingStatus: "PROCESSING",
        },
        set: {
          embeddingStatus: "READY",
          similarQuestionsStatus: "NOT_STARTED",
          similarQuestionsComputedAt: null,
          similarQuestionsComputedVersion: null,
        },
        session,
      });

      if (questionUpdate.matchedCount !== 1) return null;

      const result = await QuestionEmbedding.updateOne(
        {
          questionId,
          version,
          model,
          representationVersion: denseRepresentationVersion,
        },
        {
          $set: { vector: embedding, dimensions: embedding.length },
          $setOnInsert: {
            questionId,
            version,
            model,
            representationVersion: denseRepresentationVersion,
          },
        },
        { upsert: true, session },
      );

      questionUpdated = result.acknowledged;

      return result;
    });

    return { ...(embeddingResult ?? {}), questionUpdated };
  } finally {
    await session.endSession();
  }
};

const loadReadyQuestionForEmbeddingSideEffects = async (
  questionId: string,
  version: number,
) => {
  const [question, state] = await Promise.all([
    Question.findOne({
      _id: questionId,
      currentVersion: version,
      isActive: true,
      isDeleted: false,
    })
      .select("userId")
      .lean<{ userId: unknown }>(),
    QuestionProcessingState.findOne({
      questionId,
      questionVersion: version,
    })
      .select(
        "moderationStatus questionEligibilityStatus securityVerifierStatus embeddingStatus",
      )
      .lean<{
        moderationStatus: string;
        questionEligibilityStatus: string;
        securityVerifierStatus: string;
        embeddingStatus: string;
      }>(),
  ]);

  if (!question) return null;
  if (!state) throw new Error("Question processing state missing");
  return ["APPROVED", "FLAGGED"].includes(state.moderationStatus) &&
    state.questionEligibilityStatus === "ALLOWED" &&
    downstreamAllowedSecurityVerifierStatuses.includes(
      state.securityVerifierStatus as (typeof downstreamAllowedSecurityVerifierStatuses)[number],
    ) &&
    state.embeddingStatus === "READY"
    ? question
    : null;
};

export {
  finalizeQuestionEmbedding,
  loadCurrentQuestionVersionForEmbedding,
  loadReadyQuestionForEmbeddingSideEffects,
  lockQuestionForEmbedding,
  resetQuestionEmbeddingProcessing,
  type LockedEmbeddingQuestion,
};
