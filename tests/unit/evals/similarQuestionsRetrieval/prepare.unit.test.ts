import { describe, expect, it } from "vitest";

import {
  prepareColbertEvalCorpus,
  prepareDenseEvalCorpus,
} from "../../../../evals/similarQuestionsRetrieval/prepare.js";
import type { RetrievalCorpus } from "../../../../evals/similarQuestionsRetrieval/schema.js";

const corpus: RetrievalCorpus = [
  {
    questionId: "q1",
    version: 1,
    title: "  First   title  ",
    body: " First body ",
    tags: ["typescript"],
  },
  {
    questionId: "q2",
    version: 1,
    title: "Second title",
    body: "Second body",
    tags: [],
  },
];

const collectAsyncIterable = async <T>(values: AsyncIterable<T>) => {
  const collected: T[] = [];

  for await (const value of values) {
    collected.push(value);
  }

  return collected;
};

describe("prepareDenseEvalCorpus", () => {
  it("generates embeddings from the shared Title/Body representation", async () => {
    const inputs: string[] = [];
    const prepared = await prepareDenseEvalCorpus(corpus, async (text) => {
      inputs.push(text);
      return { embedding: [1, 0], model: "fixture-model" };
    });

    expect(inputs).toEqual([
      "Title: First title\nBody: First body",
      "Title: Second title\nBody: Second body",
    ]);
    expect(await prepared.loadCurrentEligibleQuestionVersions()).toEqual([
      { questionId: "q1", version: 1 },
      { questionId: "q2", version: 1 },
    ]);

    const embeddings = prepared.streamDenseEmbeddings({
      model: "fixture-model",
    });
    await expect(collectAsyncIterable(embeddings)).resolves.toMatchObject([
      { questionId: "q1", vector: [1, 0] },
      { questionId: "q2", vector: [1, 0] },
    ]);
  });

  it("rejects a corpus whose embeddings use multiple models", async () => {
    let index = 0;

    await expect(
      prepareDenseEvalCorpus(corpus, async () => ({
        embedding: [1, 0],
        model: index++ === 0 ? "model-a" : "model-b",
      })),
    ).rejects.toThrow("exactly one embedding model");
  });
});

describe("prepareColbertEvalCorpus", () => {
  it("encodes each document once and exposes matching multivectors", async () => {
    const inputs: Array<{ title: string; body: string; tags: string[] }> = [];
    const prepared = await prepareColbertEvalCorpus(corpus, async (input) => {
      inputs.push(input);
      return {
        vectors: [[1, 0]],
        dimensions: 2,
        tokenCount: 1,
        model: "colbert-fixture",
        representationVersion: "colbert-v1",
      };
    });

    expect(inputs).toEqual(corpus);
    await expect(
      collectAsyncIterable(
        prepared.streamMultiVectorEmbeddings({ model: "colbert-fixture" }),
      ),
    ).resolves.toMatchObject([
      { questionId: "q1", vectors: [[1, 0]], tokenCount: 1 },
      { questionId: "q2", vectors: [[1, 0]], tokenCount: 1 },
    ]);
  });
});
