import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockUserWorkerModules,
  mockUserWorkerTestEnvironment,
  resetUserWorkerTestEnvironment,
} from "../../../helpers/user/mockUserWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockUserWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockUserWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/config/mongodb.config.js",
  () => mockUserWorkerModules.mongodbConfig,
);
vi.mock(
  "../../../../src/utils/user/updateUserStats.util.js",
  () => mockUserWorkerModules.updateUserStatsUtil,
);
vi.mock(
  "../../../../src/models/question.model.js",
  () => mockUserWorkerModules.questionModel,
);
vi.mock(
  "../../../../src/models/answer.model.js",
  () => mockUserWorkerModules.answerModel,
);

const { startStatsWorker } = await import(
  "../../../../src/workers/user/stats.worker.js"
);

describe("stats worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalMongoUri = process.env.MONGO_URI;

  beforeEach(() => {
    resetUserWorkerTestEnvironment();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    process.env.MONGO_URI = originalMongoUri;
    vi.clearAllMocks();
  });

  it("connects Mongo before creating the worker", async () => {
    await startStatsWorker();

    expect(mockUserWorkerTestEnvironment.connectMongoDB).toHaveBeenCalledWith(
      "mongodb://localhost:27017/test",
    );
    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(1);
    expect(
      mockUserWorkerTestEnvironment.connectMongoDB.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockUserWorkerTestEnvironment.workerConstructor.mock
        .invocationCallOrder[0],
    );
  });

  it("creates the worker with the expected queue config", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("statsQueue");
    expect(worker.options).toMatchObject({
      connection: mockUserWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 5,
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("handles prisma-only actions and clears the user cache", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "job-1",
      id: "job-1",
      data: {
        userId: "user_1",
        action: "ASK_QUESTION",
      },
    });

    expect(mockUserWorkerTestEnvironment.updateUserStats).toHaveBeenCalledWith(
      "user_1",
      {
        questionsAsked: { increment: 1 },
      },
    );
    expect(
      mockUserWorkerTestEnvironment.redisCacheClientDelete,
    ).toHaveBeenCalledWith("user:user_1");
    expect(
      mockUserWorkerTestEnvironment.questionFindByIdAndUpdate,
    ).not.toHaveBeenCalled();
    expect(
      mockUserWorkerTestEnvironment.answerFindByIdAndUpdate,
    ).not.toHaveBeenCalled();
  });

  it("handles mongo-only actions without clearing the question cache", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "job-1",
      id: "job-1",
      data: {
        userId: "user_1",
        action: "GIVE_REPLY",
        answerId: "answer_1",
      },
    });

    expect(
      mockUserWorkerTestEnvironment.updateUserStats,
    ).not.toHaveBeenCalled();
    expect(
      mockUserWorkerTestEnvironment.answerFindByIdAndUpdate,
    ).toHaveBeenCalledWith("answer_1", { $inc: { replyCount: 1 } });
    expect(
      mockUserWorkerTestEnvironment.redisCacheClientDelete,
    ).not.toHaveBeenCalled();
  });

  it("handles prisma and question mongo actions and clears both caches", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "job-1",
      id: "job-1",
      data: {
        userId: "user_1",
        action: "GIVE_ANSWER",
        questionId: "question_1",
      },
    });

    expect(mockUserWorkerTestEnvironment.updateUserStats).toHaveBeenCalledWith(
      "user_1",
      {
        answersGiven: { increment: 1 },
        reputationPoints: { increment: 2 },
      },
    );
    expect(
      mockUserWorkerTestEnvironment.questionFindByIdAndUpdate,
    ).toHaveBeenCalledWith("question_1", { $inc: { answerCount: 1 } });
    expect(
      mockUserWorkerTestEnvironment.redisCacheClientDelete,
    ).toHaveBeenNthCalledWith(1, "user:user_1");
    expect(
      mockUserWorkerTestEnvironment.redisCacheClientDelete,
    ).toHaveBeenNthCalledWith(2, "question:question_1");
  });

  it("uses mongoTargetId when provided", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "job-1",
      id: "job-1",
      data: {
        userId: "user_1",
        action: "DELETE_ANSWER",
        questionId: "question_ignored",
        mongoTargetId: "question_override",
      },
    });

    expect(
      mockUserWorkerTestEnvironment.questionFindByIdAndUpdate,
    ).toHaveBeenCalledWith("question_override", { $inc: { answerCount: -1 } });
    expect(
      mockUserWorkerTestEnvironment.redisCacheClientDelete,
    ).toHaveBeenNthCalledWith(2, "question:question_override");
  });

  it("rejects unknown actions", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "job-1",
        id: "job-1",
        data: {
          userId: "user_1",
          action: "NOT_REAL",
        },
      }),
    ).rejects.toThrow("Unknown action: NOT_REAL");
  });

  it("rejects missing mongo target ids", async () => {
    await startStatsWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "job-1",
        id: "job-1",
        data: {
          userId: "user_1",
          action: "GIVE_REPLY",
        },
      }),
    ).rejects.toThrow("Mongo target ID missing for action");
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockUserWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startStatsWorker()).rejects.toThrow("mongo down");
    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockUserWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startStatsWorker()).rejects.toThrow("worker failed");
  });
});
