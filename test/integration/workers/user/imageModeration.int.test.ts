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
  "../../../../src/services/user/updateProfilePicture.service.js",
  () => mockUserWorkerModules.updateProfilePictureService,
);

const { startImageModerationWorker } = await import(
  "../../../../src/workers/imageModeration.worker.js"
);

describe("imageModeration worker", () => {
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
    await startImageModerationWorker();

    expect(mockUserWorkerTestEnvironment.workerInstances).toHaveLength(1);
    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    expect(worker.name).toBe("imageModerationQueue");
    expect(worker.options).toMatchObject({
      connection: mockUserWorkerTestEnvironment.redisMessagingClientConnection,
      concurrency: 1,
      limiter: {
        max: 10,
        duration: 1000,
      },
    });
    expect(worker.events.has("completed")).toBe(true);
    expect(worker.events.has("failed")).toBe(true);
    expect(worker.events.has("error")).toBe(true);
  });

  it("handles profile picture jobs with the user service", async () => {
    await startImageModerationWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await worker.processor({
      name: "PROFILE_PICTURE",
      id: "job-1",
      data: {
        userId: "user_1",
        objectKey: "profile-picture-key",
        uploadFingerprint: "upload-fingerprint",
      },
    });

    expect(
      mockUserWorkerTestEnvironment.updateProfilePictureService,
    ).toHaveBeenCalledWith(
      "user_1",
      "profile-picture-key",
      "upload-fingerprint",
    );
  });

  it("rejects invalid job types", async () => {
    await startImageModerationWorker();

    const worker = mockUserWorkerTestEnvironment.workerInstances[0];

    await expect(
      worker.processor({
        name: "INVALID_JOB",
        id: "job-1",
        data: {
          userId: "user_1",
          objectKey: "whatever",
        },
      }),
    ).rejects.toThrow("Invalid job type");
  });

  it("rejects cleanly when worker construction fails", async () => {
    mockUserWorkerTestEnvironment.workerConstructor.mockImplementationOnce(
      function workerConstructorFailure() {
        throw new Error("worker failed");
      },
    );

    await expect(startImageModerationWorker()).rejects.toThrow("worker failed");
  });
});
