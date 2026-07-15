import generateEmbedding from "../ai/generateEmbedding.service.js";
import runQuestionEmbeddingReadySideEffects from "../embedding/questionEmbeddingSideEffects.service.js";
import {
  finalizeQuestionEmbedding,
  loadCurrentQuestionVersionForEmbedding,
  loadReadyQuestionForEmbeddingSideEffects,
  lockQuestionForEmbedding,
  resetQuestionEmbeddingProcessing,
} from "../embedding/questionEmbeddingState.service.js";
import buildQuestionEmbeddingInput from "../embedding/questionEmbeddingText.service.js";
import type { QuestionEmbeddingJobData } from "../embedding/questionEmbedding.shared.js";

const runReadySideEffectsIfCurrent = async ({
  questionId,
  version,
  userId,
}: {
  questionId: string;
  version: number;
  userId?: unknown;
}) => {
  const readyQuestion = userId
    ? { userId }
    : await loadReadyQuestionForEmbeddingSideEffects(questionId, version);

  if (!readyQuestion) return;

  await runQuestionEmbeddingReadySideEffects({
    questionId,
    version,
    userId: String(readyQuestion.userId),
  });
};

const processQuestionEmbeddingJob = async ({
  questionId,
  version,
}: QuestionEmbeddingJobData) => {
  const locked = await lockQuestionForEmbedding(questionId, version);

  if (!locked) {
    await runReadySideEffectsIfCurrent({ questionId, version });
    return;
  }

  const questionVersion = await loadCurrentQuestionVersionForEmbedding(
    questionId,
    version,
  );

  if (!questionVersion) {
    await resetQuestionEmbeddingProcessing(questionId, version);
    return;
  }

  const { text, hash } = buildQuestionEmbeddingInput({
    title: questionVersion.title,
    body: questionVersion.body,
    tags: Array.isArray(questionVersion.tags) ? questionVersion.tags : [],
  });

  let embedding = locked.embedding;

  if (
    locked.embeddingHash !== hash ||
    !Array.isArray(embedding) ||
    embedding.length === 0
  ) {
    try {
      embedding = await generateEmbedding(text);
    } catch (error) {
      await resetQuestionEmbeddingProcessing(questionId, version);
      throw error;
    }
  }

  const updated = await finalizeQuestionEmbedding({
    questionId,
    version,
    embedding,
    embeddingHash: hash,
  });

  if (updated.modifiedCount === 0) return;

  await runReadySideEffectsIfCurrent({
    questionId,
    version,
    userId: locked.userId,
  });
};

export default processQuestionEmbeddingJob;
