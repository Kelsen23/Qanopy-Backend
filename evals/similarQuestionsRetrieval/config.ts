import { fileURLToPath } from "node:url";

import colbertConfig from "../../src/config/colbert.config.js";
import rerankerConfig from "../../src/config/reranker.config.js";

import type { DatasetConfig, DatasetName } from "./runner.js";
import { getRetrievalMetadata, type RetrievalName } from "./retrievals.js";

const datasetConfigs: Record<DatasetName, DatasetConfig> = {
  dev: {
    casesPath: fileURLToPath(new URL("./cases.dev.jsonl", import.meta.url)),
    corpusPath: fileURLToPath(new URL("./corpus.v1.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/similarQuestionsRetrieval/dev/", import.meta.url),
    ),
  },
  holdout: {
    casesPath: fileURLToPath(
      new URL("./cases.holdout.v1.jsonl", import.meta.url),
    ),
    corpusPath: fileURLToPath(new URL("./corpus.v1.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/similarQuestionsRetrieval/holdout-v1/", import.meta.url),
    ),
  },
  regression: {
    casesPath: fileURLToPath(
      new URL("./cases.regression.jsonl", import.meta.url),
    ),
    corpusPath: fileURLToPath(new URL("./corpus.v1.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/similarQuestionsRetrieval/regression/", import.meta.url),
    ),
  },
};

const getReportMetadata = (retrievalName: RetrievalName) =>
  getRetrievalMetadata(retrievalName, {
    colbert: colbertConfig,
    reranker: rerankerConfig,
  });

export { datasetConfigs, getReportMetadata };
