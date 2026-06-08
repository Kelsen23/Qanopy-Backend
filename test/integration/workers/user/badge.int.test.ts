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
  "../../../../src/services/user/badge/awardBadge.service.js",
  () => mockUserWorkerModules.awardBadgeService,
);

const { startBadgeWorker } = await import(
  "../../../../src/workers/badge.worker.js"
);

describe("badge worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    resetUserWorkerTestEnvironment();
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the worker with the expected queue config", async () => {
    await startBadgeWorker();

    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(1);
    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("badgeQueue");
    expect(worker.options).toMatchObject({
      connection: mockUserWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("passes valid badge trigger jobs through to awardBadge", async () => {
    await startBadgeWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "ACCOUNT_CREATED",
      id: "job-1",
      data: {
        userId: "user_1",
      },
    });

    expect(mockUserWorkerTestEnvironment.awardBadge).toHaveBeenCalledWith({
      userId: "user_1",
      trigger: "ACCOUNT_CREATED",
    });
  });

  it("rejects unsupported badge triggers", async () => {
    await startBadgeWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "NOT_A_REAL_TRIGGER",
        id: "job-1",
        data: {
          userId: "user_1",
        },
      }),
    ).rejects.toThrow("Unsupported badge trigger: NOT_A_REAL_TRIGGER");
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockUserWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startBadgeWorker()).rejects.toThrow("worker failed");
  });
});
