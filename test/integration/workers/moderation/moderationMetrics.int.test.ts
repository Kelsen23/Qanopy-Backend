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
  "../../../../src/config/prisma.config.js",
  () => mockModerationWorkerModules.prismaConfig,
);

const { startModerationMetricsWorker } = await import(
  "../../../../src/workers/moderation/moderationMetrics.worker.js"
);

describe("moderationMetrics worker", () => {
  const consoleLogSpy = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    resetModerationWorkerTestEnvironment();
    mockModerationWorkerTestEnvironment.moderationStatsFindUnique.mockResolvedValue(
      {
        userId: "user_1",
        trustScore: 0.5,
      },
    );
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the worker with the expected queue config", async () => {
    startModerationMetricsWorker();

    expect(mockModerationWorkerTestEnvironment.workerInstances).toHaveLength(1);
    const worker = mockModerationWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("moderationMetricsQueue");
    expect(worker.options).toMatchObject({
      connection:
        mockModerationWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 10,
      limiter: {
        max: 15,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("updates trust score only for IGNORE", async () => {
    const worker = startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "IGNORE",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      },
    });

    expect(worker).toBeDefined();
    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { trustScore: 0.51 },
    });
  });

  it("increments flaggedCount for WARN", async () => {
    startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "WARN",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        trustScore: 0.47,
        flaggedCount: { increment: 1 },
      },
    });
  });

  it("increments rejectedCount for BAN_TEMP", async () => {
    startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "BAN_TEMP",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        trustScore: 0.4,
        rejectedCount: { increment: 1 },
      },
    });
  });

  it("increments total strikes and sets lastStrikeAt for AI permanent bans", async () => {
    startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "BAN_PERM",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "AI_MODERATION",
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        lastStrikeAt: expect.any(Date),
        trustScore: 0.25,
        totalStrikes: { increment: 1 },
      },
    });
  });

  it("increments rejectedCount for admin permanent bans", async () => {
    startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "BAN_PERM",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        trustScore: 0.25,
        rejectedCount: { increment: 1 },
      },
    });
  });

  it("clamps trust score to the [0, 1] range", async () => {
    mockModerationWorkerTestEnvironment.moderationStatsFindUnique.mockResolvedValueOnce(
      {
        userId: "user_1",
        trustScore: 0.99,
      },
    );

    startModerationMetricsWorker();

    await mockModerationWorkerTestEnvironment.workerInstances[0].processor({
      name: "IGNORE",
      id: "job-1",
      data: {
        userId: "user_1",
        reviewedBy: "ADMIN_MODERATION",
      },
    });

    expect(
      mockModerationWorkerTestEnvironment.moderationStatsUpdate,
    ).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { trustScore: 1 },
    });
  });

  it("rejects when moderation stats are missing", async () => {
    mockModerationWorkerTestEnvironment.moderationStatsFindUnique.mockResolvedValueOnce(
      null,
    );

    startModerationMetricsWorker();

    await expect(
      mockModerationWorkerTestEnvironment.workerInstances[0].processor({
        name: "WARN",
        id: "job-1",
        data: {
          userId: "user_1",
          reviewedBy: "ADMIN_MODERATION",
        },
      }),
    ).rejects.toThrow("Moderation stats not found");
  });

  it("rejects invalid action job names", async () => {
    startModerationMetricsWorker();

    await expect(
      mockModerationWorkerTestEnvironment.workerInstances[0].processor({
        name: "NOT_REAL",
        id: "job-1",
        data: {
          userId: "user_1",
          reviewedBy: "ADMIN_MODERATION",
        },
      }),
    ).rejects.toThrow("Unsupported moderation action job type: NOT_REAL");
  });

  it("rejects invalid reviewers", async () => {
    startModerationMetricsWorker();

    await expect(
      mockModerationWorkerTestEnvironment.workerInstances[0].processor({
        name: "WARN",
        id: "job-1",
        data: {
          userId: "user_1",
          reviewedBy: "SOMEONE_ELSE",
        },
      }),
    ).rejects.toThrow("Unsupported moderation reviewer: SOMEONE_ELSE");
  });

  it("rejects cleanly when worker construction fails", () => {
    mockModerationWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    expect(() => startModerationMetricsWorker()).toThrow("worker failed");
  });
});
