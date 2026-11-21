import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import type {
  DenseCorpusSource,
  DenseSparseBm25CorpusSource,
  DenseSparseCorpusSource,
  HybridCorpusSource,
  MultiVectorCorpusSource,
  RerankerCorpusSource,
  RetrievalInput,
  SparseCorpusSource,
} from "../../src/services/question/similarQuestions/retrieval/retrieval.types.js";

import findDenseQuestionCandidates from "../../src/services/question/similarQuestions/similarQuestionsSearch.service.js";
import findColbertQuestionCandidates from "../../src/services/question/similarQuestions/retrieval/colbert/colbertRetrieval.service.js";
import findHybridQuestionCandidates from "../../src/services/question/similarQuestions/retrieval/hybrid/hybridRetrieval.service.js";
import findDenseSpladeBm25QuestionCandidates from "../../src/services/question/similarQuestions/retrieval/hybrid/denseSpladeBm25Retrieval.service.js";
import findDenseSpladeQuestionCandidates from "../../src/services/question/similarQuestions/retrieval/hybrid/denseSpladeRetrieval.service.js";
import {
  findDenseBm25ExpansionQuestionCandidates,
  findDenseSpladeExpansionQuestionCandidates,
} from "../../src/services/question/similarQuestions/retrieval/hybrid/densePrimaryExpansionRetrieval.service.js";
import findDenseRerankerQuestionCandidates from "../../src/services/question/similarQuestions/retrieval/reranker/denseRerankerRetrieval.service.js";
import findSpladeQuestionCandidates from "../../src/services/question/similarQuestions/retrieval/splade/spladeRetrieval.service.js";

import { closeColbertEmbeddingWorker } from "../../src/services/question/embedding/colbert/colbertEmbeddingWorker.service.js";
import { closeRerankerWorker } from "../../src/services/question/embedding/reranker/rerankerWorker.service.js";
import { closeSparseEmbeddingWorker } from "../../src/services/question/embedding/sparse/sparseEmbeddingWorker.service.js";

import { loadRetrievalCorpus, loadRetrievalEvalDataset } from "./load.js";
import {
  prepareColbertEvalCorpus,
  prepareDenseEvalCorpus,
  prepareDenseRerankerEvalCorpus,
  prepareDenseSparseBm25EvalCorpus,
  prepareDenseSparseEvalCorpus,
  prepareHybridEvalCorpus,
  prepareSparseEvalCorpus,
} from "./prepare.js";
import type { RetrievalEvalRunnerDependencies } from "./runner.js";
import {
  denseSpladeBm25RetrievalNames,
  denseSpladeRetrievalNames,
  getRrfWeights,
  hybridRetrievalNames,
  type RetrievalName,
} from "./retrievals.js";

const getGitCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
};

const createRetrievalDependencies = (
  retrievalName: RetrievalName,
): RetrievalEvalRunnerDependencies => {
  let preparedCorpus:
    | DenseCorpusSource
    | HybridCorpusSource
    | DenseSparseCorpusSource
    | DenseSparseBm25CorpusSource
    | SparseCorpusSource
    | MultiVectorCorpusSource
    | RerankerCorpusSource
    | undefined;

  return {
    loadCases: loadRetrievalEvalDataset,
    loadCorpus: async (filename) => {
      const corpus = await loadRetrievalCorpus(filename);

      if (retrievalName === "dense-v1")
        preparedCorpus = await prepareDenseEvalCorpus(corpus);
      else if (
        retrievalName === "dense-bm25-expansion-v1" ||
        hybridRetrievalNames.includes(retrievalName)
      )
        preparedCorpus = await prepareHybridEvalCorpus(corpus);
      else if (retrievalName === "splade-v1")
        preparedCorpus = await prepareSparseEvalCorpus(corpus);
      else if (denseSpladeRetrievalNames.includes(retrievalName))
        preparedCorpus = await prepareDenseSparseEvalCorpus(corpus);
      else if (
        denseSpladeBm25RetrievalNames.includes(retrievalName) ||
        retrievalName === "dense-splade-expansion-v1"
      )
        preparedCorpus = await prepareDenseSparseBm25EvalCorpus(corpus);
      else if (retrievalName === "colbert-v1")
        preparedCorpus = await prepareColbertEvalCorpus(corpus);
      else preparedCorpus = await prepareDenseRerankerEvalCorpus(corpus);

      return corpus;
    },
    retrieve: (input: RetrievalInput) => {
      if (!preparedCorpus)
        throw new Error("Retrieval eval corpus has not been prepared");

      if (retrievalName === "dense-v1")
        return findDenseQuestionCandidates({
          ...input,
          corpus: preparedCorpus as DenseCorpusSource,
        });

      if (hybridRetrievalNames.includes(retrievalName))
        return findHybridQuestionCandidates({
          ...input,
          corpus: preparedCorpus as HybridCorpusSource,
          rrfWeights: getRrfWeights(retrievalName),
        });

      if (retrievalName === "splade-v1")
        return findSpladeQuestionCandidates({
          ...input,
          corpus: preparedCorpus as SparseCorpusSource,
        });

      if (retrievalName === "dense-splade-expansion-v1")
        return findDenseSpladeExpansionQuestionCandidates({
          ...input,
          corpus: preparedCorpus as DenseSparseCorpusSource,
        });

      if (retrievalName === "dense-bm25-expansion-v1")
        return findDenseBm25ExpansionQuestionCandidates({
          ...input,
          corpus: preparedCorpus as HybridCorpusSource,
        });

      if (denseSpladeRetrievalNames.includes(retrievalName))
        return findDenseSpladeQuestionCandidates({
          ...input,
          corpus: preparedCorpus as DenseSparseCorpusSource,
          rrfWeights: getRrfWeights(retrievalName),
        });

      if (denseSpladeBm25RetrievalNames.includes(retrievalName))
        return findDenseSpladeBm25QuestionCandidates({
          ...input,
          corpus: preparedCorpus as DenseSparseBm25CorpusSource,
          rrfWeights: getRrfWeights(retrievalName),
        });

      if (retrievalName === "dense-reranker-v1")
        return findDenseRerankerQuestionCandidates({
          ...input,
          resultLimit: 50,
          corpus: preparedCorpus as RerankerCorpusSource,
        });

      return findColbertQuestionCandidates({
        ...input,
        corpus: preparedCorpus as MultiVectorCorpusSource,
      });
    },
    now: () => performance.now(),
    getTimestamp: () => new Date().toISOString(),
    getGitCommit,
    createReportDirectory: async (directory) => {
      await mkdir(directory, { recursive: true });
    },
    writeReport: (filename, report) =>
      writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    log: (...values) => console.log(...values),
  };
};

const closeRetrievalWorkers = async () => {
  await closeColbertEmbeddingWorker();
  await closeSparseEmbeddingWorker();
  await closeRerankerWorker();
};

export { closeRetrievalWorkers, createRetrievalDependencies };
