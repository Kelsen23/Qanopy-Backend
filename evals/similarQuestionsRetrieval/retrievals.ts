type RetrievalName =
  | "dense-v1"
  | "hybrid-v1"
  | "splade-v1"
  | "dense-splade-v1"
  | "dense-splade-bm25-v1"
  | "colbert-v1"
  | "dense-reranker-v1"
  | "hybrid-dense-rrf-v1"
  | "hybrid-strong-dense-rrf-v1"
  | "dense-splade-dense-rrf-v1"
  | "dense-splade-strong-dense-rrf-v1"
  | "dense-splade-bm25-dense-rrf-v1"
  | "dense-splade-bm25-strong-dense-rrf-v1"
  | "dense-splade-expansion-v1"
  | "dense-bm25-expansion-v1";

const hybridRetrievalNames: RetrievalName[] = [
  "hybrid-v1",
  "hybrid-dense-rrf-v1",
  "hybrid-strong-dense-rrf-v1",
];

const denseSpladeRetrievalNames: RetrievalName[] = [
  "dense-splade-v1",
  "dense-splade-dense-rrf-v1",
  "dense-splade-strong-dense-rrf-v1",
];

const denseSpladeBm25RetrievalNames: RetrievalName[] = [
  "dense-splade-bm25-v1",
  "dense-splade-bm25-dense-rrf-v1",
  "dense-splade-bm25-strong-dense-rrf-v1",
];

const parseDatasetName = (args: string[]) => {
  const argumentIndex = args.findIndex((arg) => arg === "--dataset");
  const separateValue =
    argumentIndex >= 0 ? args[argumentIndex + 1] : undefined;
  const inlineValue = args
    .find((arg) => arg.startsWith("--dataset="))
    ?.slice("--dataset=".length);
  const value = separateValue ?? inlineValue ?? "dev";

  if (!value || value.startsWith("--"))
    throw new Error(
      "Missing value for --dataset. Expected dev, holdout, or regression.",
    );

  if (value === "dev" || value === "holdout" || value === "regression")
    return value;

  throw new Error(
    `Unsupported similarQuestions retrieval eval dataset: ${value}. Expected dev, holdout, or regression.`,
  );
};

const parseRetrievalName = (args: string[]): RetrievalName => {
  const argument = args.find(
    (arg) => arg === "--retrieval" || arg.startsWith("--retrieval="),
  );
  const index = argument ? args.indexOf(argument) : -1;
  const value =
    argument === "--retrieval"
      ? args[index + 1]
      : argument?.slice("--retrieval=".length);
  const retrievalName = value ?? "dense-v1";
  const supported = [
    "dense-v1",
    ...hybridRetrievalNames,
    "splade-v1",
    ...denseSpladeRetrievalNames,
    ...denseSpladeBm25RetrievalNames,
    "colbert-v1",
    "dense-reranker-v1",
    "dense-splade-expansion-v1",
    "dense-bm25-expansion-v1",
  ];

  if (!retrievalName || retrievalName.startsWith("--"))
    throw new Error(
      "Missing value for --retrieval. Expected a supported retrieval name.",
    );

  if (supported.includes(retrievalName)) return retrievalName as RetrievalName;

  throw new Error(
    `Unsupported retrieval: ${retrievalName}. See evals/similarQuestionsRetrieval/retrievals.ts for supported retrieval selectors.`,
  );
};

const getRrfWeights = (name: RetrievalName) => {
  if (name.includes("strong-dense"))
    return { dense: 1, sparse: 0.25, bm25: 0.25 };
  if (name.includes("dense-rrf")) return { dense: 1, sparse: 0.5, bm25: 0.5 };
  return undefined;
};

const getRetrievalMetadata = (
  retrievalName: RetrievalName,
  configs: {
    colbert: Record<string, unknown>;
    reranker: Record<string, unknown>;
  },
) => {
  const expansionBranch =
    retrievalName === "dense-splade-expansion-v1" ? "splade-v1" : "bm25-v1";

  if (
    retrievalName === "dense-splade-expansion-v1" ||
    retrievalName === "dense-bm25-expansion-v1"
  )
    return {
      retrievalVersion: retrievalName,
      candidateLimit: 50,
      resultLimit: 15,
      strategy: "dense-primary-candidate-expansion",
      expansionBranch,
    };

  const rrfWeights = getRrfWeights(retrievalName);
  if (rrfWeights)
    return {
      retrievalVersion: retrievalName,
      candidateLimit: 50,
      resultLimit: 15,
      fusion: "weighted-reciprocal-rank-fusion",
      rrfK: 60,
      rrfWeights,
    };

  if (retrievalName === "colbert-v1")
    return {
      model: configs.colbert.model,
      checkpointPath: configs.colbert.checkpointPath,
      representationVersion: "colbert-v1",
      candidateLimit: 50,
      resultLimit: 15,
      metric: "cosine-maxsim",
    };

  if (retrievalName === "dense-splade-v1")
    return {
      retrievalVersion: retrievalName,
      candidateLimit: 50,
      resultLimit: 15,
      fusion: "reciprocal-rank-fusion",
      rrfK: 60,
    };

  if (retrievalName === "dense-splade-bm25-v1")
    return {
      retrievalVersion: retrievalName,
      candidateLimit: 50,
      resultLimit: 15,
      fusion: "reciprocal-rank-fusion",
      rrfK: 60,
      branches: ["dense-v1", "splade-v1", "bm25-v1"],
    };

  if (retrievalName === "dense-reranker-v1")
    return {
      retrievalVersion: retrievalName,
      model: configs.reranker.model,
      checkpointPath: configs.reranker.checkpointPath,
      representationVersion: "dense-reranker-text-v1",
      candidateLimit: 50,
      resultLimit: 50,
      metric: "cross-encoder",
    };

  return undefined;
};

export {
  denseSpladeBm25RetrievalNames,
  denseSpladeRetrievalNames,
  getRetrievalMetadata,
  getRrfWeights,
  hybridRetrievalNames,
  parseDatasetName,
  parseRetrievalName,
};

export type { RetrievalName };
