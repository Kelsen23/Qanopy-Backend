import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockAuthWorkerModules,
  mockAuthWorkerTestEnvironment,
  resetAuthWorkerTestEnvironment,
} from "../../../helpers/auth/mockAuthWorkerTestEnvironment.js";

vi.mock("bullmq", () => mockAuthWorkerModules.bullmq);
vi.mock(
  "../../../../src/config/redis.config.js",
  () => mockAuthWorkerModules.redisConfig,
);
vi.mock(
  "../../../../src/queues/unverifiedAccountCleanup.queue.js",
  () => mockAuthWorkerModules.unverifiedAccountCleanupQueue,
);
vi.mock(
  "../../../../src/services/auth/unverifiedAccountCleanup.service.js",
  () => mockAuthWorkerModules.unverifiedAccountCleanupService,
);

const {
  CLEANUP_JOB_NAME,
  CLEANUP_REPEAT_EVERY_MS,
  startUnverifiedAccountCleanupWorker,
} = await import("../../../../src/workers/auth/unverifiedAccountCleanup.worker.js");

describe("unverifiedAccountCleanup worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    resetAuthWorkerTestEnvironment();
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("bootstraps, schedules cleanup, and creates the worker", async () => {
    mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers.mockResolvedValue(
      3,
    );

    await startUnverifiedAccountCleanupWorker();

    expect(
      mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers,
    ).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[unverifiedAccountCleanup:init]",
      { initialCleanedCount: 3 },
    );
    expect(
      mockAuthWorkerTestEnvironment.unverifiedAccountCleanupQueueAdd,
    ).toHaveBeenCalledWith(
      CLEANUP_JOB_NAME,
      {},
      expect.objectContaining({
        repeat: { every: CLEANUP_REPEAT_EVERY_MS },
        removeOnComplete: true,
        removeOnFail: false,
        jobId: "cleanup-expired-unverified-accounts",
      }),
    );

    expect(mockAuthWorkerTestEnvironment.workerInstances).toHaveLength(1);
    const worker = mockAuthWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("unverifiedAccountCleanupQueue");
    expect(worker.options).toMatchObject({
      connection: mockAuthWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("ignores unrelated jobs", async () => {
    mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers.mockResolvedValue(
      1,
    );

    await startUnverifiedAccountCleanupWorker();

    const worker = mockAuthWorkerTestEnvironment.workerInstances[0];
    const result = await worker.processor({
      name: "SOME_OTHER_JOB",
      id: "job-1",
    });

    expect(result).toBeUndefined();
    expect(
      mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers,
    ).toHaveBeenCalledTimes(1);
  });

  it("runs cleanup jobs and returns the cleaned count", async () => {
    mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers.mockResolvedValue(
      2,
    );

    await startUnverifiedAccountCleanupWorker();

    const worker = mockAuthWorkerTestEnvironment.workerInstances[0];
    const result = await worker.processor({
      name: CLEANUP_JOB_NAME,
      id: "job-1",
    });

    expect(result).toBe(2);
    expect(
      mockAuthWorkerTestEnvironment.cleanupAllExpiredUnverifiedUsers,
    ).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith("[unverifiedAccountCleanup]", {
      cleanedCount: 2,
    });
  });
});
