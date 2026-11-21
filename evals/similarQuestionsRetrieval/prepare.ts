import type {
  DenseCorpusSource,
  DenseEmbeddingRecord,
  DenseSparseCorpusSource,
  DenseSparseBm25CorpusSource,
  HybridCorpusSource,
  SparseCorpusSource,
  SparseEmbeddingRecord,
  MultiVectorCorpusSource,
  MultiVectorEmbeddingRecord,
  RerankerCorpusSource,
} from "../../src/services/question/similarQuestions/retrieval/retrieval.types.js";
import type { RetrievalCorpus } from "./schema.js";

import generateEmbedding from "../../src/services/question/ai/generateEmbedding.service.js";
import buildQuestionEmbeddingInput from "../../src/services/question/embedding/dense/questionEmbeddingText.service.js";
import { generateSparseEmbedding } from "../../src/services/question/embedding/sparse/sparseEmbedding.service.js";
import { generateColbertEmbedding } from "../../src/services/question/embedding/colbert/colbertEmbedding.service.js";
import { buildDenseAnnIndex } from "../../src/services/question/similarQuestions/retrieval/dense/denseAnnIndex.service.js";

type EmbeddingGenerator = (text: string) => Promise<{
  embedding: number[];
  model: string;
}>;

type SparseEmbeddingGenerator = (input: {
  title: string;
  body: string;
  tags: string[];
}) => Promise<{
  indices: number[];
  values: number[];
  model: string;
  representationVersion: string;
}>;

type ColbertEmbeddingGenerator = (input: {
  title: string;
  body: string;
  tags: string[];
}) => Promise<{
  vectors: number[][];
  dimensions: number;
  tokenCount: number;
  model: string;
  representationVersion: string;
}>;

const prepareDenseEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: EmbeddingGenerator = generateEmbedding,
): Promise<DenseCorpusSource> => {
  const embeddings: DenseEmbeddingRecord[] = [];

  for (const question of corpus) {
    const { embedding, model } = await embeddingGenerator(
      buildQuestionEmbeddingInput(question).text,
    );

    embeddings.push({
      questionId: question.questionId,
      version: question.version,
      vector: embedding,
      model,
      representationVersion: "dense-v1",
    });
  }

  const models = new Set(embeddings.map(({ model }) => model));

  if (models.size !== 1) {
    throw new Error(
      `Retrieval eval corpus must use exactly one embedding model; found ${models.size}`,
    );
  }

  const useHnsw = process.env.RETRIEVAL_EVAL_USE_HNSW !== "false";
  const denseAnnIndex = useHnsw ? buildDenseAnnIndex(embeddings) : null;

  const loadCurrentEligibleQuestionVersions = async () =>
    corpus.map(({ questionId, version }) => ({ questionId, version }));
  const loadCurrentEligibleQuestionVersionsById = async (
    questionIds: string[],
  ) => {
    const questionIdSet = new Set(questionIds);

    return corpus
      .filter(({ questionId }) => questionIdSet.has(questionId))
      .map(({ questionId, version }) => ({ questionId, version }));
  };

  return {
    loadCurrentEligibleQuestionVersions,
    loadCurrentEligibleQuestionVersionsById,
    streamDenseEmbeddings: ({ model }) => {
      const stream = (async function* () {
        for (const embedding of embeddings) {
          if (embedding.model === model) yield embedding;
        }
      })();

      return Object.assign(stream, {
        close: async () => undefined,
      });
    },
    ...(denseAnnIndex
      ? {
          searchDenseEmbeddings: async ({
            queryVector,
            model,
            limit,
          }: {
            queryVector: number[];
            model: string;
            limit: number;
          }) =>
            model === embeddings[0]?.model
              ? denseAnnIndex.search(queryVector, Math.max(limit * 5 + 1, 101))
              : [],
        }
      : {}),
  };
};

const prepareHybridEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: EmbeddingGenerator = generateEmbedding,
): Promise<HybridCorpusSource> => {
  const denseCorpus = await prepareDenseEvalCorpus(corpus, embeddingGenerator);
  const loadCurrentEligibleQuestionDocuments = async () => corpus;
  const loadCurrentEligibleQuestionDocumentsById = async (
    questionIds: string[],
  ) => {
    const questionIdSet = new Set(questionIds);

    return corpus
      .filter(({ questionId }) => questionIdSet.has(questionId))
      .map(({ questionId, version }) => ({ questionId, version }));
  };

  return {
    ...denseCorpus,
    loadCurrentEligibleQuestionDocuments,
    loadCurrentEligibleQuestionDocumentsById,
  };
};

const prepareDenseSparseEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: EmbeddingGenerator = generateEmbedding,
  sparseEmbeddingGenerator: SparseEmbeddingGenerator = (input) =>
    generateSparseEmbedding(input),
): Promise<DenseSparseCorpusSource> => {
  const [denseCorpus, sparseCorpus] = await Promise.all([
    prepareDenseEvalCorpus(corpus, embeddingGenerator),
    prepareSparseEvalCorpus(corpus, sparseEmbeddingGenerator),
  ]);

  return {
    ...denseCorpus,
    streamSparseEmbeddings: sparseCorpus.streamSparseEmbeddings,
  };
};

const prepareDenseSparseBm25EvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: EmbeddingGenerator = generateEmbedding,
  sparseEmbeddingGenerator: SparseEmbeddingGenerator = (input) =>
    generateSparseEmbedding(input),
): Promise<DenseSparseBm25CorpusSource> => {
  const denseSparseCorpus = await prepareDenseSparseEvalCorpus(
    corpus,
    embeddingGenerator,
    sparseEmbeddingGenerator,
  );

  return {
    ...denseSparseCorpus,
    loadCurrentEligibleQuestionDocuments: async () => corpus,
    loadCurrentEligibleQuestionDocumentsById: async (questionIds) => {
      const questionIdSet = new Set(questionIds);
      return corpus
        .filter(({ questionId }) => questionIdSet.has(questionId))
        .map(({ questionId, version }) => ({ questionId, version }));
    },
  };
};

const prepareSparseEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: SparseEmbeddingGenerator = (input) =>
    generateSparseEmbedding(input),
): Promise<SparseCorpusSource> => {
  const embeddings: SparseEmbeddingRecord[] = [];

  for (const question of corpus) {
    const embedding = await embeddingGenerator(question);
    embeddings.push({
      questionId: question.questionId,
      version: question.version,
      indices: embedding.indices,
      values: embedding.values,
      model: embedding.model,
      representationVersion: embedding.representationVersion,
    });
  }

  const loadCurrentEligibleQuestionVersions = async () =>
    corpus.map(({ questionId, version }) => ({ questionId, version }));
  const loadCurrentEligibleQuestionVersionsById = async (
    questionIds: string[],
  ) => {
    const questionIdSet = new Set(questionIds);
    return corpus
      .filter(({ questionId }) => questionIdSet.has(questionId))
      .map(({ questionId, version }) => ({ questionId, version }));
  };

  return {
    loadCurrentEligibleQuestionVersions,
    loadCurrentEligibleQuestionVersionsById,
    streamSparseEmbeddings: ({ model }) => {
      const stream = (async function* () {
        for (const embedding of embeddings) {
          if (embedding.model === model) yield embedding;
        }
      })();
      return Object.assign(stream, { close: async () => undefined });
    },
  };
};

const prepareColbertEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: ColbertEmbeddingGenerator = (input) =>
    generateColbertEmbedding(input),
): Promise<MultiVectorCorpusSource> => {
  const embeddings: MultiVectorEmbeddingRecord[] = [];

  for (const question of corpus) {
    const embedding = await embeddingGenerator(question);
    embeddings.push({
      questionId: question.questionId,
      version: question.version,
      vectors: embedding.vectors,
      dimensions: embedding.dimensions,
      tokenCount: embedding.tokenCount,
      model: embedding.model,
      representationVersion: embedding.representationVersion,
    });
  }

  const loadCurrentEligibleQuestionVersions = async () =>
    corpus.map(({ questionId, version }) => ({ questionId, version }));
  const loadCurrentEligibleQuestionVersionsById = async (
    questionIds: string[],
  ) => {
    const questionIdSet = new Set(questionIds);
    return corpus
      .filter(({ questionId }) => questionIdSet.has(questionId))
      .map(({ questionId, version }) => ({ questionId, version }));
  };

  return {
    loadCurrentEligibleQuestionVersions,
    loadCurrentEligibleQuestionVersionsById,
    streamMultiVectorEmbeddings: ({ model }) => {
      const stream = (async function* () {
        for (const embedding of embeddings) {
          if (embedding.model === model) yield embedding;
        }
      })();
      return Object.assign(stream, { close: async () => undefined });
    },
  };
};

const prepareDenseRerankerEvalCorpus = async (
  corpus: RetrievalCorpus,
  embeddingGenerator: EmbeddingGenerator = generateEmbedding,
): Promise<RerankerCorpusSource> => {
  const denseCorpus = await prepareDenseEvalCorpus(corpus, embeddingGenerator);
  return {
    ...denseCorpus,
    loadQuestionDocumentsById: async (identities) => {
      const identitySet = new Set(
        identities.map(({ questionId, version }) =>
          JSON.stringify([questionId, version]),
        ),
      );
      return corpus.filter(({ questionId, version }) =>
        identitySet.has(JSON.stringify([questionId, version])),
      );
    },
  };
};

export {
  prepareColbertEvalCorpus,
  prepareDenseEvalCorpus,
  prepareDenseSparseEvalCorpus,
  prepareDenseSparseBm25EvalCorpus,
  prepareHybridEvalCorpus,
  prepareSparseEvalCorpus,
  prepareDenseRerankerEvalCorpus,
};
