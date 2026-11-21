import {
  closeRetrievalWorkers,
  createRetrievalDependencies,
} from "./dependencies.js";
import { datasetConfigs, getReportMetadata } from "./config.js";
import { runRetrievalEval } from "./runner.js";
import { parseDatasetName, parseRetrievalName } from "./retrievals.js";

const run = async () => {
  const args = process.argv.slice(2);
  const dataset = parseDatasetName(args);
  const retrievalName = parseRetrievalName(args);

  try {
    await runRetrievalEval({
      retrievalName,
      dataset,
      datasetConfig: datasetConfigs[dataset],
      reportMetadata: getReportMetadata(retrievalName),
      dependencies: createRetrievalDependencies(retrievalName),
    });
  } finally {
    await closeRetrievalWorkers();
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
