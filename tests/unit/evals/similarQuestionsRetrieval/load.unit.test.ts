import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadRetrievalCorpus,
  loadRetrievalEvalDataset,
} from "../../../../evals/similarQuestionsRetrieval/load.js";

const temporaryDirectories: string[] = [];

const createJsonlFile = async (contents: string) => {
  const directory = await mkdtemp(join(tmpdir(), "qanopy-retrieval-eval-"));
  temporaryDirectories.push(directory);
  const filename = join(directory, "data.jsonl");
  await writeFile(filename, contents, "utf8");
  return filename;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const validCorpusQuestion = (questionId: string, version = 1) =>
  JSON.stringify({
    questionId,
    version,
    title: `Question ${questionId}`,
    body: "A question body for retrieval.",
    tags: ["TYPESCRIPT"],
  });

const validCase = (id: string, sourceQuestionId = id) =>
  JSON.stringify({
    id,
    description: `Case ${id}`,
    source: { questionId: sourceQuestionId, version: 1 },
    relevant: [{ questionId: "target", version: 1, grade: 3 }],
    tags: ["fixture"],
  });

describe("loadRetrievalCorpus", () => {
  it("loads valid rows, skips blank lines, and preserves order", async () => {
    const filename = await createJsonlFile(
      `\n${validCorpusQuestion("q-1")}\n\n${validCorpusQuestion("q-2")}\n`,
    );

    await expect(loadRetrievalCorpus(filename)).resolves.toMatchObject([
      { questionId: "q-1" },
      { questionId: "q-2" },
    ]);
  });

  it("allows an empty corpus", async () => {
    const filename = await createJsonlFile("\n  \n");

    await expect(loadRetrievalCorpus(filename)).resolves.toEqual([]);
  });

  it("reports malformed JSON with filename and line number", async () => {
    const filename = await createJsonlFile("not-json\n");

    await expect(loadRetrievalCorpus(filename)).rejects.toThrow(
      `${filename}:1: invalid JSON:`,
    );
  });

  it("reports corpus row schema failures with filename and line number", async () => {
    const filename = await createJsonlFile(
      '\n\n{"questionId":"q-1","version":1,"title":"Missing body","tags":[]}\n',
    );

    await expect(loadRetrievalCorpus(filename)).rejects.toThrow(
      `${filename}:3: invalid retrieval corpus question:`,
    );
  });

  it("rejects duplicate corpus question/version identities", async () => {
    const filename = await createJsonlFile(
      `${validCorpusQuestion("q-1")}\n${validCorpusQuestion("q-1")}\n`,
    );

    await expect(loadRetrievalCorpus(filename)).rejects.toThrow(
      "Corpus question/version identities must be unique",
    );
  });
});

describe("loadRetrievalEvalDataset", () => {
  it("loads valid rows, skips blank lines, and preserves order", async () => {
    const filename = await createJsonlFile(
      `\n${validCase("case-1")}\n\n${validCase("case-2")}\n`,
    );

    await expect(loadRetrievalEvalDataset(filename)).resolves.toMatchObject([
      { id: "case-1" },
      { id: "case-2" },
    ]);
  });

  it("allows an empty dataset", async () => {
    const filename = await createJsonlFile("\n  \n");

    await expect(loadRetrievalEvalDataset(filename)).resolves.toEqual([]);
  });

  it("reports malformed JSON with filename and line number", async () => {
    const filename = await createJsonlFile("not-json\n");

    await expect(loadRetrievalEvalDataset(filename)).rejects.toThrow(
      `${filename}:1: invalid JSON:`,
    );
  });

  it("reports eval case schema failures with filename and line number", async () => {
    const filename = await createJsonlFile(
      '\n\n{"id":"case-1","description":"Missing source","relevant":[],"tags":[]}\n',
    );

    await expect(loadRetrievalEvalDataset(filename)).rejects.toThrow(
      `${filename}:3: invalid similarQuestions retrieval eval case:`,
    );
  });

  it("rejects duplicate case IDs and source identities", async () => {
    const duplicateCases = await createJsonlFile(
      `${validCase("case-1")}\n${validCase("case-1", "source-2")}\n`,
    );
    const duplicateSources = await createJsonlFile(
      `${validCase("case-1", "shared-source")}\n${validCase("case-2", "shared-source")}\n`,
    );

    await expect(loadRetrievalEvalDataset(duplicateCases)).rejects.toThrow(
      "Retrieval eval case IDs must be unique",
    );
    await expect(loadRetrievalEvalDataset(duplicateSources)).rejects.toThrow(
      "Each source question/version may appear in only one similarQuestions retrieval eval case",
    );
  });
});
