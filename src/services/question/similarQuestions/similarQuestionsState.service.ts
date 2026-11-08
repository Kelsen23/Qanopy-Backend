import mongoose from "mongoose";

import type { RetrievalCandidate } from "./retrieval/retrieval.types.js";

import { publicQuestionProcessingStateMatch } from "./similarQuestions.shared.js";
import {
  findOneAndUpdateQuestionProcessingState,
  updateQuestionProcessingState,
} from "../processingState/questionProcessingState.service.js";

import Question from "../../../models/question.model.js";
import SimilarQuestion from "../../../models/similarQuestion.model.js";
import QuestionProcessingState from "../../../models/questionProcessingState.model.js";

type LockedSimilarQuestionsQuestion = {
  _id: unknown;
  userId: unknown;
};

const lockQuestionForSimilarQuestions = async (
  questionId: string,
  version: number,
) =>
  findOneAndUpdateQuestionProcessingState({
    questionId: new mongoose.Types.ObjectId(questionId),
    questionVersion: version,
    match: {
      ...publicQuestionProcessingStateMatch,
      embeddingStatus: "READY",
      similarQuestionsStatus: { $in: ["NOT_STARTED", "PENDING"] },
    },
    set: { similarQuestionsStatus: "PROCESSING" },
  });

const resetSimilarQuestionsProcessing = async (
  questionId: string,
  version: number,
) =>
  updateQuestionProcessingState({
    questionId,
    questionVersion: version,
    match: {
      similarQuestionsStatus: "PROCESSING",
    },
    set: {
      similarQuestionsStatus: "NOT_STARTED",
      similarQuestionsComputedAt: null,
      similarQuestionsComputedVersion: null,
    },
  });

const invalidateSimilarQuestions = async (
  questionId: string,
  version: number,
) =>
  updateQuestionProcessingState({
    questionId,
    questionVersion: version,
    set: {
      similarQuestionsStatus: "NOT_STARTED",
      similarQuestionsComputedAt: null,
      similarQuestionsComputedVersion: null,
    },
  });

const finalizeSimilarQuestions = async ({
  questionId,
  version,
  candidates,
  retrievalVersion,
}: {
  questionId: string;
  version: number;
  candidates: RetrievalCandidate[];
  retrievalVersion: string;
}) => {
  const materializedCandidates = candidates.slice(0, 15);
  const session = await mongoose.startSession();
  const computedAt = new Date();

  try {
    let updateResult;

    await session.withTransaction(async () => {
      const source = await Question.findOne({
        _id: questionId,
        currentVersion: version,
        isActive: true,
        isDeleted: false,
      })
        .select("_id")
        .session(session)
        .lean();
      const processingState = await QuestionProcessingState.findOne({
        questionId,
        questionVersion: version,
        ...publicQuestionProcessingStateMatch,
        embeddingStatus: "READY",
        similarQuestionsStatus: "PROCESSING",
      })
        .select("_id")
        .session(session)
        .lean();

      if (!source || !processingState) return;

      await SimilarQuestion.deleteMany(
        {
          sourceQuestionId: questionId,
          sourceVersion: version,
          retrievalVersion,
        },
        { session },
      );

      if (materializedCandidates.length) {
        const sourceQuestionObjectId = new mongoose.Types.ObjectId(questionId);

        await SimilarQuestion.insertMany(
          materializedCandidates.map((candidate, index) => ({
            sourceQuestionId: sourceQuestionObjectId,
            sourceVersion: version,
            targetQuestionId: new mongoose.Types.ObjectId(candidate.questionId),
            targetVersion: candidate.version,
            rank: index + 1,
            score: candidate.score,
            retrievalVersion,
            model: candidate.model,
            representationVersion: candidate.representationVersion,
            computedAt,
          })),
          { session, ordered: true },
        );
      }

      updateResult = await updateQuestionProcessingState({
        questionId,
        questionVersion: version,
        match: {
          similarQuestionsStatus: "PROCESSING",
        },
        set: {
          similarQuestionsStatus: "READY",
          similarQuestionsComputedAt: computedAt,
          similarQuestionsComputedVersion: version,
        },
        session,
      });

      if (updateResult.matchedCount !== 1) {
        throw new Error(
          "Question processing state changed during finalization",
        );
      }
    });

    if (!updateResult) {
      await resetSimilarQuestionsProcessing(questionId, version);
    }

    return updateResult ?? { modifiedCount: 0 };
  } finally {
    await session.endSession();
  }
};

const loadReadyQuestionForSimilarSideEffects = async (
  questionId: string,
  version: number,
) => {
  const [question, processingState] = await Promise.all([
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
        "moderationStatus questionEligibilityStatus securityVerifierStatus embeddingStatus similarQuestionsStatus",
      )
      .lean<Record<string, string>>(),
  ]);

  if (!question) return null;
  if (!processingState) throw new Error("Question processing state missing");
  return ["APPROVED", "FLAGGED"].includes(processingState.moderationStatus) &&
    processingState.questionEligibilityStatus === "ALLOWED" &&
    ["NOT_REQUIRED", "ALLOWED", "ALLOWED_WITH_CONSTRAINTS"].includes(
      processingState.securityVerifierStatus,
    ) &&
    processingState.embeddingStatus === "READY" &&
    processingState.similarQuestionsStatus === "READY"
    ? question
    : null;
};

export {
  finalizeSimilarQuestions,
  invalidateSimilarQuestions,
  loadReadyQuestionForSimilarSideEffects,
  lockQuestionForSimilarQuestions,
  resetSimilarQuestionsProcessing,
  type LockedSimilarQuestionsQuestion,
};
