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
  "../../../../src/models/modActionLog.model.js",
  () => mockModerationWorkerModules.modActionLogModel,
);

const { startModerationAuditWorker } = await import(
  "../../../../src/workers/moderation/moderationAudit.worker.js"
);

describe("moderationAudit worker", () => {
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

  it("connects Mongo and creates the worker with the expected queue config", async () => {
    await startModerationAuditWorker();

    expect(
      mockModerationWorkerTestEnvironment.connectMongoDB,
    ).toHaveBeenCalledWith("mongodb://localhost:27017/test");
    expect(mockModerationWorkerTestEnvironment.workerInstances).toHaveLength(1);

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("moderationAuditQueue");
    expect(worker.options).toMatchObject({
      connection:
        mockModerationWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 15,
      limiter: {
        max: 15,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("persists the full moderation action payload", async () => {
    await startModerationAuditWorker();

    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];
    const payload = {
      decisionId: "decision_1",
      targetType: "QUESTION",
      targetId: "question_1",
      targetUserId: "user_2",
      actorType: "ADMIN_MODERATION",
      adminId: "admin_1",
      actionTaken: "WARN",
      meta: {
        reason: "policy",
      },
    };

    await worker.processor({
      name: "AUDIT",
      id: "job-1",
      data: payload,
    });

    expect(
      mockModerationWorkerTestEnvironment.modActionLogCreate,
    ).toHaveBeenCalledWith(payload);
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockModerationWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startModerationAuditWorker()).rejects.toThrow("mongo down");
    expect(mockModerationWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockModerationWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startModerationAuditWorker()).rejects.toThrow("worker failed");
  });
});
