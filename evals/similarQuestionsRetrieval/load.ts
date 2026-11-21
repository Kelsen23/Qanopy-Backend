import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import type { ZodError } from "zod";

import type {
  RetrievalCorpus,
  RetrievalEvalCase,
  RetrievalEvalDataset,
} from "./schema.js";
import {
  retrievalCorpusSchema,
  retrievalCorpusQuestionSchema,
  retrievalEvalCaseSchema,
  retrievalEvalDatasetSchema,
} from "./schema.js";

const formatValidationIssues = (error: ZodError) =>
  error.issues
    .map(({ path, message }) => {
      const issuePath = path.length > 0 ? `.${path.join(".")}` : "";

      return `${issuePath} ${message}`;
    })
    .join("; ");

type JsonlRow = {
  lineNumber: number;
  value: unknown;
};

const readJsonl = async (filename: string): Promise<JsonlRow[]> => {
  const rows: JsonlRow[] = [];
  const lines = createInterface({
    input: createReadStream(filename),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;

      if (line.trim().length === 0) continue;

      try {
        rows.push({ lineNumber, value: JSON.parse(line) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(`${filename}:${lineNumber}: invalid JSON: ${message}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(`${filename}:`)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`${filename}: unable to read JSONL file: ${message}`);
  } finally {
    lines.close();
  }

  return rows;
};

const loadRetrievalCorpus = async (
  filename: string,
): Promise<RetrievalCorpus> => {
  const rows = await readJsonl(filename);
  const corpusQuestions: RetrievalCorpus[number][] = [];

  for (const { lineNumber, value } of rows) {
    const result = retrievalCorpusQuestionSchema.safeParse(value);

    if (!result.success) {
      throw new Error(
        `${filename}:${lineNumber}: invalid retrieval corpus question: ${formatValidationIssues(result.error)}`,
      );
    }

    corpusQuestions.push(result.data);
  }

  const result = retrievalCorpusSchema.safeParse(corpusQuestions);

  if (!result.success) {
    throw new Error(
      `${filename}: invalid retrieval corpus: ${formatValidationIssues(result.error)}`,
    );
  }

  return result.data;
};

const loadRetrievalEvalDataset = async (
  filename: string,
): Promise<RetrievalEvalDataset> => {
  const rows = await readJsonl(filename);
  const cases: RetrievalEvalCase[] = [];

  for (const { lineNumber, value } of rows) {
    const result = retrievalEvalCaseSchema.safeParse(value);

    if (!result.success) {
      throw new Error(
        `${filename}:${lineNumber}: invalid similarQuestions retrieval eval case: ${formatValidationIssues(result.error)}`,
      );
    }

    cases.push(result.data);
  }

  const result = retrievalEvalDatasetSchema.safeParse(cases);

  if (!result.success) {
    throw new Error(
      `${filename}: invalid similarQuestions retrieval eval dataset: ${formatValidationIssues(result.error)}`,
    );
  }

  return result.data;
};

export { loadRetrievalCorpus, loadRetrievalEvalDataset };
