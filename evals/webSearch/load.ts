import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import type { ZodError } from "zod";

import type { WebSearchEvalCase } from "./schema.js";
import {
  webSearchEvalCaseSchema,
  webSearchEvalCaseSetSchema,
} from "./schema.js";

const formatValidationIssues = (error: ZodError) =>
  error.issues
    .map(({ path, message }) => {
      const issuePath = path.length > 0 ? `.${path.join(".")}` : "";

      return `${issuePath} ${message}`;
    })
    .join("; ");

const loadWebSearchEvalCases = async (
  filename: string,
): Promise<WebSearchEvalCase[]> => {
  const cases: WebSearchEvalCase[] = [];
  const lines = createInterface({
    input: createReadStream(filename),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;

      if (line.trim().length === 0) continue;

      let parsedLine: unknown;
      try {
        parsedLine = JSON.parse(line);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(`${filename}:${lineNumber}: invalid JSON: ${message}`);
      }

      const result = webSearchEvalCaseSchema.safeParse(parsedLine);

      if (!result.success) {
        throw new Error(
          `${filename}:${lineNumber}: invalid web search eval case: ${formatValidationIssues(result.error)}`,
        );
      }

      cases.push(result.data);
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

  const result = webSearchEvalCaseSetSchema.safeParse(cases);

  if (!result.success) {
    throw new Error(
      `${filename}: invalid web search eval dataset: ${formatValidationIssues(result.error)}`,
    );
  }

  return result.data;
};

export { loadWebSearchEvalCases };
