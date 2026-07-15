import runSimilarQuestionsReadySideEffects from "../similarQuestions/similarQuestionsSideEffects.service.js";
import findSimilarQuestionIds from "../similarQuestions/similarQuestionsSearch.service.js";
import {
  finalizeSimilarQuestions,
  loadReadyQuestionForSimilarSideEffects,
  lockQuestionForSimilarQuestions,
  resetSimilarQuestionsProcessing,
} from "../similarQuestions/similarQuestionsState.service.js";
import type { SimilarQuestionsJobData } from "../similarQuestions/similarQuestions.shared.js";

const runReadySideEffectsIfCurrent = async ({
  questionId,
  version,
  userId,
  similarQuestionIds,
}: {
  questionId: string;
  version: number;
  userId?: unknown;
  similarQuestionIds?: Awaited<ReturnType<typeof findSimilarQuestionIds>>;
}) => {
  const readyQuestion =
    userId && similarQuestionIds
      ? { userId, similarQuestionIds }
      : await loadReadyQuestionForSimilarSideEffects(questionId, version);

  if (!readyQuestion) return;

  await runSimilarQuestionsReadySideEffects({
    questionId,
    version,
    userId: String(readyQuestion.userId),
    similarQuestionIds: readyQuestion.similarQuestionIds,
  });
};

const processSimilarQuestionsJob = async ({
  questionId,
  version,
}: SimilarQuestionsJobData) => {
  const locked = await lockQuestionForSimilarQuestions(questionId, version);

  if (!locked) {
    await runReadySideEffectsIfCurrent({ questionId, version });
    return;
  }

  const embedding = locked.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    await resetSimilarQuestionsProcessing(questionId, version);
    return;
  }

  let similarQuestionIds: Awaited<ReturnType<typeof findSimilarQuestionIds>>;

  try {
    similarQuestionIds = await findSimilarQuestionIds({
      questionId,
      embedding,
    });
  } catch (error) {
    await resetSimilarQuestionsProcessing(questionId, version);
    throw error;
  }

  const updated = await finalizeSimilarQuestions({
    questionId,
    version,
    similarQuestionIds,
  });

  if (updated.modifiedCount === 0) return;

  await runReadySideEffectsIfCurrent({
    questionId,
    version,
    userId: locked.userId,
    similarQuestionIds,
  });
};

export default processSimilarQuestionsJob;
