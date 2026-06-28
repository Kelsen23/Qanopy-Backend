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
  "../../../../src/services/user/processAccountDeletion.service.js",
  () => mockUserWorkerModules.processAccountDeletionService,
);

const { startAccountDeletionWorker } = await import(
  "../../../../src/workers/user/accountDeletion.worker.js"
);

describe("accountDeletion worker", () => {
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
    await startAccountDeletionWorker();

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
    await startAccountDeletionWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("accountDeletionQueue");
    expect(worker.options).toMatchObject({
      connection: mockUserWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 1,
      limiter: {
        max: 5,
        duration: 5000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("passes job data through to deleteAccount", async () => {
    await startAccountDeletionWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];
    const result = await worker.processor({
      name: "DELETE_ACCOUNT",
      id: "job-1",
      data: {
        userId: "user_1",
        profilePictureKey: "profile-key",
      },
    });

    expect(result).toBeUndefined();
    expect(
      mockUserWorkerTestEnvironment.processAccountDeletionService,
    ).toHaveBeenCalledWith({
      userId: "user_1",
      profilePictureKey: "profile-key",
    });
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockUserWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startAccountDeletionWorker()).rejects.toThrow("mongo down");
    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockUserWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startAccountDeletionWorker()).rejects.toThrow("worker failed");
  });
});
