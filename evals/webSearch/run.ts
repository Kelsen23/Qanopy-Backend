import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { executeWebSearch } from "../../src/services/question/ai/answer/tools/webSearch/webSearch.service.js";
import { webSearchEvalJudgeEnvSchema } from "../../src/validations/config/llmGateway.schema.js";

import { judgeWebSearchBatch } from "./judge.js";
import { loadWebSearchEvalCases } from "./load.js";
import {
  runWebSearchEval,
  type DatasetConfig,
  type DatasetName,
  type WebSearchEvalRunnerDependencies,
} from "./runner.js";
import { scoreWebSearchCase } from "./score.js";

const datasetConfigs: Record<DatasetName, DatasetConfig> = {
  dev: {
    path: fileURLToPath(new URL("./cases.dev.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/webSearch/dev/", import.meta.url),
    ),
  },
  holdout: {
    path: fileURLToPath(new URL("./cases.holdout.v1.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/webSearch/holdout-v1/", import.meta.url),
    ),
  },
  regression: {
    path: fileURLToPath(new URL("./cases.regression.jsonl", import.meta.url)),
    reportDirectory: fileURLToPath(
      new URL("../../.eval-results/webSearch/regression/", import.meta.url),
    ),
  },
};

const parseArgument = (args: string[], name: string) => {
  const argumentIndex = args.findIndex((arg) => arg === name);

  if (argumentIndex >= 0) {
    const value = args[argumentIndex + 1];

    if (!value || value.startsWith("--") || !value.trim()) {
      throw new Error(`Missing value for ${name}`);
    }

    return value;
  }

  const inlineArgument = args.find((arg) => arg.startsWith(`${name}=`));
  const inlineValue = inlineArgument?.slice(name.length + 1);

  if (inlineArgument && !inlineValue?.trim()) {
    throw new Error(`Missing value for ${name}`);
  }

  return inlineValue;
};

const parseDatasetName = (args: string[]): DatasetName => {
  const dataset = parseArgument(args, "--dataset") ?? "dev";

  if (dataset === "dev" || dataset === "holdout" || dataset === "regression") {
    return dataset;
  }

  throw new Error(
    `Unsupported web search eval dataset: ${dataset}. Expected dev, holdout, or regression.`,
  );
};

const parsePositiveIntegerArgument = (
  args: string[],
  name: string,
  fallback: number,
) => {
  const value = parseArgument(args, name);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

const getGitCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
};

const dependencies: WebSearchEvalRunnerDependencies = {
  loadCases: loadWebSearchEvalCases,
  executeSearch: async ({ input, remainingEvidenceTokens }) => {
    return executeWebSearch({ ...input, remainingEvidenceTokens });
  },
  judgeCases: judgeWebSearchBatch,
  scoreCase: scoreWebSearchCase,
  now: () => performance.now(),
  getTimestamp: () => new Date().toISOString(),
  getGitCommit,
  createReportDirectory: async (directory) => {
    await mkdir(directory, { recursive: true });
  },
  writeReport: (filename, report) =>
    writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  getDatasetHash: async (filename) =>
    createHash("sha256")
      .update(await readFile(filename))
      .digest("hex"),
  log: (...values) => console.log(...values),
};

const run = async () => {
  const args = process.argv.slice(2);
  const dataset = parseDatasetName(args);
  const caseId = parseArgument(args, "--case-id");
  const evidenceTokenBudget = parsePositiveIntegerArgument(
    args,
    "--evidence-token-budget",
    4000,
  );
  const batchSize = parsePositiveIntegerArgument(args, "--batch-size", 1);
  const judgeRoute = webSearchEvalJudgeEnvSchema.parse(process.env);

  await runWebSearchEval({
    dataset,
    datasetConfig: datasetConfigs[dataset],
    dependencies,
    judgeProvider: judgeRoute.LLM_EVALS_WEB_SEARCH_JUDGE_PROVIDER,
    judgeModel: judgeRoute.LLM_EVALS_WEB_SEARCH_JUDGE_MODEL,
    evidenceTokenBudget,
    batchSize,
    caseId,
  });
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
