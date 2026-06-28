import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockModerationWorkerModules,
  mockModerationWorkerTestEnvironment,
  resetModerationWorkerTestEnvironment,
} from "../../../helpers/moderation/mockModerationWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockModerationWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockModerationWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/config/mongodb.config.js",
  () => mockModerationWorkerModules.mongodbConfig,
);
vi.mock(
  "../../../../src/services/moderation/ai/processContent.service.js",
  () => mockModerationWorkerModules.processContentService,
);

const { startContentModerationWorker } = await import(
  "../../../../src/workers/moderation/contentModeration.worker.js"
);

describe("contentModeration worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalMongoUri = process.env.MONGO_URI;

  beforeEach(() => {
    resetModerationWorkerTestEnvironment();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    process.env.MONGO_URI = originalMongoUri;
    vi.clearAllMocks();
  });

  it("connects Mongo before creating the worker", async () => {
    await startContentModerationWorker();

    expect(
      mockModerationWorkerTestEnvironment.connectMongoDB,
    ).toHaveBeenCalledWith("mongodb://localhost:27017/test");
    expect(mockModerationWorkerTestEnvironment.workerInstances).toHaveLength(1);
  });

  it("creates the worker with the expected queue config", async () => {
    await startContentModerationWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("contentModerationQueue");
    expect(worker.options).toMatchObject({
      connection:
        mockModerationWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 3,
      limiter: {
        max: 7,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("passes question versions to processContent", async () => {
    await startContentModerationWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "QUESTION",
      id: "job-1",
      data: {
        contentId: "question_1",
        version: 3,
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.processContent,
    ).toHaveBeenCalledWith("question_1", "QUESTION", 3);
  });

  it("passes moderation revisions for non-question jobs", async () => {
    await startContentModerationWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "ANSWER",
      id: "job-1",
      data: {
        contentId: "answer_1",
        moderationRevision: 4,
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.processContent,
    ).toHaveBeenCalledWith("answer_1", "ANSWER", 4);
  });

  it("rejects unsupported moderation job names", async () => {
    await startContentModerationWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "NOT_REAL",
        id: "job-1",
        data: {
          contentId: "content_1",
        },
      }),
    ).rejects.toThrow("Unsupported moderation job type: NOT_REAL");
  });

  it("logs and rethrows processing failures", async () => {
    mockModerationWorkerTestEnvironment.processContent.mockRejectedValueOnce(
      new Error("processing failed"),
    );

    await startContentModerationWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "REPLY",
        id: "job-1",
        data: {
          contentId: "reply_1",
          moderationRevision: 2,
        },
      }),
    ).rejects.toThrow("processing failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error processing moderation report:",
      expect.any(Error),
    );
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockModerationWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startContentModerationWorker()).rejects.toThrow("mongo down");
    expect(mockModerationWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockModerationWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startContentModerationWorker()).rejects.toThrow(
      "worker failed",
    );
  });
});
