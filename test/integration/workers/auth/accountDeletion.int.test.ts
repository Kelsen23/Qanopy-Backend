import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthWorkerModules,
  mockAuthWorkerTestEnvironment,
  resetAuthWorkerTestEnvironment,
} from "../../../helpers/mockAuthWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockAuthWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/config/mongodb.config.js",
  () => mockAuthWorkerModules.mongodbConfig,
);
vi.mock(
  "../../../../src/services/auth/deleteAccount.service.js",
  () => mockAuthWorkerModules.deleteAccountService,
);

const { startAccountDeletionWorker } = await import(
  "../../../../src/workers/accountDeletion.worker.js"
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
    resetAuthWorkerTestEnvironment();
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

    expect(mockAuthWorkerTestEnvironment.connectMongoDB).toHaveBeenCalledWith(
      "mongodb://localhost:27017/test",
    );
    expect(mockAuthWorkerTestEnvironment.workerInstances).toHaveLength(1);
    expect(
      mockAuthWorkerTestEnvironment.connectMongoDB.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockAuthWorkerTestEnvironment.workerConstructor.mock
        .invocationCallOrder[0],
    );
  });

  it("creates the worker with the expected queue config", async () => {
    await startAccountDeletionWorker();

    const worker = mockAuthWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("accountDeletionQueue");
    expect(worker.options).toMatchObject({
      connection: mockAuthWorkerTestEnvironment.redisMessagingClientConnection,
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

    const worker = mockAuthWorkerTestEnvironment.workerInstances[0];
    const result = await worker.processor({
      name: "DELETE_ACCOUNT",
      id: "job-1",
      data: {
        userId: "user_1",
        profilePictureKey: "profile-key",
      },
    });

    expect(result).toBeUndefined();
    expect(mockAuthWorkerTestEnvironment.deleteAccount).toHaveBeenCalledWith({
      userId: "user_1",
      profilePictureKey: "profile-key",
    });
  });

  it("rejects cleanly when Mongo connection fails", async () => {
    mockAuthWorkerTestEnvironment.connectMongoDB.mockRejectedValueOnce(
      new Error("mongo down"),
    );

    await expect(startAccountDeletionWorker()).rejects.toThrow("mongo down");
    expect(mockAuthWorkerTestEnvironment.workerInstances).toHaveLength(0);
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockAuthWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startAccountDeletionWorker()).rejects.toThrow("worker failed");
  });
});
